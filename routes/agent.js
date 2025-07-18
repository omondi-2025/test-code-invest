const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Deposit = require("../models/Deposit");
const Investment = require("../models/Investment");

// GET /api/agent/:refCode - Get referrals by referral code
router.get("/:refCode", async (req, res) => {
  const { refCode } = req.params;

  try {
    const referredUsers = await User.find({ referredBy: refCode });
    const referrer = await User.findOne({ refCode });

    if (!referrer) {
      return res.status(404).json({ success: false, message: "❌ Referrer not found" });
    }

    const results = [];

    for (const user of referredUsers) {
      const deposits = await Deposit.find({ userId: user._id });
      const investments = await Investment.find({ userId: user._id });

      const recharge = deposits.reduce((sum, d) => sum + d.amount, 0);
      const investment = investments.reduce((sum, i) => sum + i.amount, 0);

      const commission = parseFloat((investment * 0.20).toFixed(2)); // 20% Level 1 bonus
	  
      results.push({
        fullName: user.fullName || "-",
        phone: user.phone || "-",
        email: user.email || "-",
        recharge,
        investment,
        commission
      });
    }

    res.json({ success: true, referrals: results });
  } catch (error) {
    console.error("❌ Error fetching agent referrals:", error);
    res.status(500).json({ success: false, message: "Server error loading referrals." });
  }
});

module.exports = router;