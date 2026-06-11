const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Deposit = require("../models/Deposit");
const Investment = require("../models/Investment");
const { requireAuth } = require("../middleware/auth");

// GET /api/agent — referrals for the logged-in user's own refCode
router.get("/", requireAuth, async (req, res) => {
  try {
    const referrer = await User.findById(req.userId);
    if (!referrer || !referrer.refCode) {
      return res.status(404).json({ success: false, message: "❌ Referrer not found" });
    }

    const referredUsers = await User.find({ referredBy: referrer.refCode });
    if (!referredUsers.length) {
      return res.json({ success: true, referrals: [] });
    }

    const userIds = referredUsers.map((u) => u._id);

    // Aggregate totals in two queries instead of two per referred user
    const [depositTotals, investmentTotals] = await Promise.all([
      Deposit.aggregate([
        { $match: { user: { $in: userIds }, status: "approved" } },
        { $group: { _id: "$user", total: { $sum: "$amount" } } },
      ]),
      Investment.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", total: { $sum: "$amount" } } },
      ]),
    ]);

    const depositMap = new Map(depositTotals.map((d) => [String(d._id), d.total]));
    const investMap = new Map(investmentTotals.map((i) => [String(i._id), i.total]));

    // Actual bonuses paid are recorded on the referrer document
    const bonusMap = new Map();
    for (const r of referrer.referrals || []) {
      const key = String(r.userId);
      bonusMap.set(key, (bonusMap.get(key) || 0) + Number(r.bonus || 0));
    }

    const results = referredUsers.map((user) => {
      const key = String(user._id);
      return {
        fullName: user.fullName || "-",
        phone: user.phone || "-",
        email: user.email || "-",
        recharge: depositMap.get(key) || 0,
        investment: investMap.get(key) || 0,
        commission: parseFloat((bonusMap.get(key) || 0).toFixed(2)),
      };
    });

    res.json({ success: true, referrals: results });
  } catch (error) {
    console.error("❌ Error fetching agent referrals:", error);
    res.status(500).json({ success: false, message: "Server error loading referrals." });
  }
});

module.exports = router;
