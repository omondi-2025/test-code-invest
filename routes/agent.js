const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Deposit = require("../models/Deposit");
const Investment = require("../models/Investment");
const { requireAuth } = require("../middleware/auth");

async function referralsForUser(userId) {
  const referrer = await User.findById(userId);
  if (!referrer || !referrer.refCode) {
    return { status: 404, body: { success: false, message: "❌ Referrer not found" } };
  }

  const referredUsers = await User.find({ referredBy: referrer.refCode });
  if (!referredUsers.length) {
    return { status: 200, body: { success: true, referrals: [] } };
  }

  const userIds = referredUsers.map((u) => u._id);

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

  return { status: 200, body: { success: true, referrals: results } };
}

// GET /api/agent — referrals for the logged-in user's own refCode
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await referralsForUser(req.userId);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error("❌ Error fetching agent referrals:", error);
    res.status(500).json({ success: false, message: "Server error loading referrals." });
  }
});

// Legacy alias — older cached pages called GET /api/agent/:refCode
router.get("/:refCode", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.refCode !== req.params.refCode) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const result = await referralsForUser(req.userId);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error("❌ Error fetching agent referrals:", error);
    res.status(500).json({ success: false, message: "Server error loading referrals." });
  }
});

module.exports = router;
