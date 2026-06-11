const express = require("express");
const router = express.Router();
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");
const moment = require("moment-timezone");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const MIN_WITHDRAWAL = 200;
const TAX_RATE = 0.18;
const OPEN_HOUR = 9;   // 9 AM
const CLOSE_HOUR = 17; // 5 PM

/**
 * 🏧 POST /api/withdraw  (own account only)
 * Body: { amount, phone? , mpesaNumber? }
 * - Min 200
 * - 09:00–17:00 Kenya time only
 * - One request per day
 * - 18% tax; gross deducted from wallet atomically
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    let { amount, phone, mpesaNumber } = req.body;

    amount = Number(amount);
    if (Number.isNaN(amount)) amount = 0;

    const payoutNumber = (phone || mpesaNumber || "").toString().trim();

    if (!amount || !payoutNumber) {
      return res
        .status(400)
        .json({ success: false, message: "❗ Amount and M-PESA number are required." });
    }

    if (!/^(?:254|0)(7|1)\d{8}$/.test(payoutNumber)) {
      return res
        .status(400)
        .json({ success: false, message: "❗ Enter a valid Kenyan M-PESA number." });
    }

    if (amount < MIN_WITHDRAWAL) {
      return res
        .status(400)
        .json({ success: false, message: `Minimum withdrawal is Ksh ${MIN_WITHDRAWAL}.` });
    }

    // business hours check (Kenya local time)
    const kenyaTime = moment().tz("Africa/Nairobi");
    const hour = kenyaTime.hour();
    const now = kenyaTime.toDate();

    if (hour < OPEN_HOUR || hour >= CLOSE_HOUR) {
      return res.status(400).json({
        success: false,
        message: "Withdrawal requests are accepted from 9AM to 5PM only.",
      });
    }

    // ⛔ Only one withdrawal per day
    const todayStart = kenyaTime.clone().startOf("day").toDate();
    const todayEnd = kenyaTime.clone().endOf("day").toDate();

    const existingToday = await Withdrawal.findOne({
      user: req.userId,
      status: { $ne: "rejected" },
      date: { $gte: todayStart, $lte: todayEnd },
    });

    if (existingToday) {
      return res.status(400).json({
        success: false,
        message: "🚫 You can only make one withdrawal per day.",
      });
    }

    // 18% tax
    const tax = amount * TAX_RATE;
    const netAmount = Math.floor(amount - tax);

    // Atomic deduction — only succeeds if the wallet still covers the amount.
    const user = await User.findOneAndUpdate(
      { _id: req.userId, wallet: { $gte: amount } },
      { $inc: { wallet: -amount, cashouts: amount } },
      { new: true }
    );

    if (!user) {
      const exists = await User.exists({ _id: req.userId });
      if (!exists) return res.status(404).json({ success: false, message: "❌ User not found." });
      return res.status(400).json({ success: false, message: "❌ Insufficient wallet balance." });
    }

    const withdrawalDoc = new Withdrawal({
      user: req.userId,
      amount: amount, // gross
      amountAfterTax: netAmount,
      mpesaNumber: payoutNumber,
      status: "pending",
      date: now,
    });
    await withdrawalDoc.save();

    return res.status(201).json({
      success: true,
      message: `✅ Withdrawal request submitted. Ksh ${netAmount.toFixed(2)} (after 18% tax) will be processed.`,
    });
  } catch (error) {
    console.error("❌ Withdrawal error:", error);
    return res
      .status(500)
      .json({ success: false, message: "🚫 Internal server error." });
  }
});

/**
 * 👨‍💼 GET /api/withdraw/all
 * Admin view: all withdrawals with user info.
 * NOTE: must be declared before parameterized GET routes.
 */
router.get("/all", requireAdmin, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find()
      .sort({ date: -1 })
      .populate({
        path: "user",
        select: "fullName phone email",
      });

    res.json({ success: true, withdrawals });
  } catch (err) {
    console.error("❌ Admin withdrawal fetch error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * 📄 GET /api/withdraw
 * Own withdrawal history.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ user: req.userId }).sort({ date: -1 });

    const mapped = withdrawals.map((w) => ({
      _id: w._id,
      amount: w.amountAfterTax ?? w.amount, // show net if available
      status: w.status,
      date: w.date,
      phone: w.mpesaNumber,
    }));

    return res.status(200).json({ success: true, history: mapped });
  } catch (error) {
    console.error("❌ Fetch withdrawal history error:", error);
    return res
      .status(500)
      .json({ success: false, message: "🚫 Failed to load withdrawal history." });
  }
});

/**
 * 💼 GET /api/withdraw/balance — own wallet balance
 */
router.get("/balance", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, wallet: user.wallet });
  } catch (err) {
    console.error("❌ Wallet fetch error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
