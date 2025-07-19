const express = require("express");
const router = express.Router();
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");
const moment = require("moment-timezone");

/**
 * 🏧 POST /api/withdraw
 * Body: { userId, amount, phone? , mpesaNumber? }
 * - Min 200
 * - 09:00–17:00 only
 * - 18% tax
 * - Deduct full (gross) from wallet
 * - Record both gross + net
 */
router.post("/", async (req, res) => {
  try {
    let { userId, amount, phone, mpesaNumber } = req.body;

    // normalize numeric amount
    amount = Number(amount);
    if (Number.isNaN(amount)) amount = 0;

    // accept either field name from frontend
    const payoutNumber = (phone || mpesaNumber || "").toString().trim();

    // basic required field validation
    if (!userId || !amount || !payoutNumber) {
      return res
        .status(400)
        .json({ success: false, message: "❗ All fields (userId, amount, phone) are required." });
    }

    // business rule: min 200
    if (amount < 200) {
      return res
        .status(400)
        .json({ success: false, message: "Minimum withdrawal is Ksh 200." });
    }

    // business hours check (Kenya local time)
const kenyaTime = moment().tz("Africa/Nairobi");
const hour = kenyaTime.hour();
const now = kenyaTime.toDate(); // ✅ Needed for database timestamp
console.log("🇰🇪 Kenya Time:", kenyaTime.format(), "→ Hour:", hour);

if (hour < 9 || hour >= 17) {
  return res.status(400).json({
    success: false,
    message: "Withdrawals are allowed from 9AM to 5PM only.",
  });
}

    // load user
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "❌ User not found." });
    }

    // wallet check
    if (user.wallet < amount) {
      return res
        .status(400)
        .json({ success: false, message: "❌ Insufficient wallet balance." });
    }

    // 18% tax
    const tax = amount * 0.18;
    const netAmount = Math.floor(amount - tax); // floor to whole shillings

    // create withdrawal doc (if using Withdrawal collection)
    const withdrawalDoc = new Withdrawal({
      user: userId,
      amount: amount,        // gross
      amountAfterTax: netAmount,
      mpesaNumber: payoutNumber,
      status: "pending",
      date: now,
    });
    await withdrawalDoc.save();

    // also (optionally) mirror to user.withdrawals array if schema has it
    if (Array.isArray(user.withdrawals)) {
      user.withdrawals.push({
        amount: netAmount, // what user expects to receive
        phone: payoutNumber,
        date: now,
        status: "pending",
      });
    }

    // deduct from wallet & track cashouts
    user.wallet -= amount;
    user.cashouts = (user.cashouts || 0) + amount;
    await user.save();

    return res.status(201).json({
      success: true,
      message: `✅ Withdrawal request submitted. Ksh ${netAmount.toFixed(
        2
      )} (after 18% tax) will be processed.`,
    });
  } catch (error) {
    console.error("❌ Withdrawal error:", error);
    return res
      .status(500)
      .json({ success: false, message: "🚫 Internal server error." });
  }
});

/**
 * 📄 GET /api/withdraw?userId=xxx
 * Returns user's withdrawal history.
 * Uses Withdrawal collection as source of truth;
 * falls back to user.withdrawals array if needed.
 */
router.get("/", async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res
      .status(400)
      .json({ success: false, message: "❗ Missing userId in query." });
  }

  try {
    // primary: pull from Withdrawal model
    const withdrawals = await Withdrawal.find({ user: userId }).sort({ date: -1 });

    // if none found AND user doc has embedded history, include those
    if (!withdrawals.length) {
      const user = await User.findById(userId);
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "❌ User not found." });
      }
      return res.status(200).json({
  success: true,
  history: user.withdrawals || [],
});
    }

    // map to shape frontend expects (amount, status, date)
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
 * 💼 GET /api/withdraw/balance/:userId
 * (Convenience — mirrors deposit balance route)
 */
router.get("/balance/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, wallet: user.wallet });
  } catch (err) {
    console.error("❌ Wallet fetch error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * 👨‍💼 GET /api/withdraw/all
 * Admin view: all withdrawals with user info.
 */
router.get("/all", async (req, res) => {
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

module.exports = router;
