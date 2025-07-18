const express = require("express");
const router = express.Router();
const cron = require("node-cron");
const Investment = require("../models/Investment");
const User = require("../models/User");

const isDev = process.env.NODE_ENV !== "production";

// 📥 POST /api/invest — Initiate a new investment
router.post("/", async (req, res) => {
  const { userId, amount, planId } = req.body;

  if (!userId || !amount || !planId) {
    return res.status(400).json({ success: false, message: "❗ Missing required fields." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "❌ User not found." });

    if (user.wallet < amount) {
      return res.status(400).json({ success: false, message: "❌ Insufficient wallet balance." });
    }

    // Deduct from wallet and update investment stats
user.wallet -= amount;
user.expenses += amount;         // ✅ Track total amount spent on packages
user.totalInvested += amount;    // ✅ Track total amount invested
await user.save();

    // Calculate daily earning (now using 25% per day)
    const dailyProfit = parseFloat((amount * 0.25).toFixed(2));
    const durationDays = 100;

    const newInvestment = new Investment({
      userId: user._id,
      amount,
      daily: dailyProfit,
      duration: `${durationDays} days`,
      startDate: new Date(),
      endDate: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
      earned: 0,
      status: "Active",
    });

    await newInvestment.save();

    // ✅ Referral bonus (Level 1 only)
    if (user.referredBy) {
      const referrer = await User.findOne({ refCode: user.referredBy });
      if (referrer) {
        const bonus = parseFloat((amount * 0.20).toFixed(2));

        referrer.wallet += bonus;
        referrer.referralBonus += bonus;

        referrer.referrals = referrer.referrals || [];
        referrer.referrals.push({
          userId: user._id,
          amount,
          bonus,
          date: new Date()
        });

        await referrer.save();
      }
    }

    res.status(201).json({
      success: true,
      message: "✅ Investment created.",
      user,
      investment: newInvestment,
    });

  } catch (err) {
    console.error("❌ Investment creation error:", err);
    res.status(500).json({ success: false, message: "🚫 Server error. Please try again." });
  }
});

// 📤 GET /api/invest?userId=... — Get user's investments
router.get("/", async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ success: false, message: "❗ Missing userId." });
  }

  try {
    const investments = await Investment.find({ userId }).sort({ startDate: -1 });

    // ✅ Auto-mark expired investments as Completed
    const now = new Date();
    for (let inv of investments) {
      if (inv.status === "Active" && new Date(inv.endDate) <= now) {
        inv.status = "Completed";
        await inv.save();
      }
    }

    res.status(200).json({ success: true, investments });
  } catch (err) {
    console.error("❌ Error fetching investments:", err);
    res.status(500).json({ success: false, message: "🚫 Failed to fetch investments." });
  }
});
  // CRON
cron.schedule("* * * * *", async () => {
 // console.log("⏰ Cron running:", new Date());

  try {
    const investments = await Investment.find({ status: "Active" });

    for (const inv of investments) {
      const now = new Date();
      const last = inv.lastEarned ? new Date(inv.lastEarned) : new Date(inv.startDate);
      const hoursPassed = (now.getTime() - last.getTime()) / (1000 * 60 * 60);

      if (hoursPassed >= 24) {
        const user = await User.findById(inv.userId);
        if (!user) continue;

        user.wallet = parseFloat((user.wallet + inv.daily).toFixed(2));
        user.dailyIncome = parseFloat((user.dailyIncome + inv.daily).toFixed(2));
        inv.earned = parseFloat((inv.earned + inv.daily).toFixed(2));
        inv.lastEarned = now;

        await inv.save(); // ✅ Save updated investment
        await user.save(); // ✅ Save updated user

       // console.log(`✅ ${user.email} credited KES ${inv.daily} at ${now}`);
      } else {
        console.log(`⏳ Skipped ${inv._id}, only ${hoursPassed.toFixed(2)} hours passed`);
      }
    }

    console.log("✅ Daily earning job done.");
  } catch (err) {
   // console.error("❌ Cron job error:", err.message);
  }
});
module.exports = router;