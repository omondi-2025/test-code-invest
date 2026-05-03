const express = require("express");
const router = express.Router();
const cron = require("node-cron");
const Investment = require("../models/Investment");
const User = require("../models/User");

const isDev = process.env.NODE_ENV !== "production";

// 📥 POST /api/invest — Initiate a new investment
router.post("/", async (req, res) => {
  const { userId, amount, planId } = req.body;
  const normalizedAmount = Number(amount);

  if (!userId || !normalizedAmount || !planId) {
    return res.status(400).json({ success: false, message: "❗ Missing required fields." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "❌ User not found." });

    const wallet = Number(user.wallet || 0);
    if (wallet < normalizedAmount) {
      return res.status(400).json({ success: false, message: "❌ Insufficient wallet balance." });
    }

    // Deduct from wallet and update investment stats
    user.wallet = parseFloat((wallet - normalizedAmount).toFixed(2));
    user.expenses = parseFloat((Number(user.expenses || 0) + normalizedAmount).toFixed(2));
    user.totalInvested = parseFloat((Number(user.totalInvested || 0) + normalizedAmount).toFixed(2));
    await user.save();

    // Calculate daily earning (now using 25% per day)
    const dailyProfit = parseFloat((normalizedAmount * 0.25).toFixed(2));
    const durationDays = 100;

    const newInvestment = new Investment({
      userId: user._id,
      amount: normalizedAmount,
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
        const bonus = parseFloat((normalizedAmount * 0.20).toFixed(2));

        referrer.wallet = parseFloat((Number(referrer.wallet || 0) + bonus).toFixed(2));
        referrer.referralBonus = parseFloat((Number(referrer.referralBonus || 0) + bonus).toFixed(2));

        referrer.referrals = referrer.referrals || [];
        referrer.referrals.push({
          userId: user._id,
          amount: normalizedAmount,
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
// ─── Shared earnings processing logic ───────────────────────────────────────
async function processEarnings() {
  const investments = await Investment.find({ status: "Active" });
  let credited = 0;

  for (const inv of investments) {
    const now = new Date();

    // Mark expired investments as Completed
    if (new Date(inv.endDate) <= now) {
      inv.status = "Completed";
      await inv.save();
      continue;
    }

    const last = inv.lastEarned ? new Date(inv.lastEarned) : new Date(inv.startDate);
    const hoursPassed = (now.getTime() - last.getTime()) / (1000 * 60 * 60);

    if (hoursPassed >= 24) {
      const user = await User.findById(inv.userId);
      if (!user) continue;

      user.wallet = parseFloat((Number(user.wallet || 0) + Number(inv.daily || 0)).toFixed(2));
      user.dailyIncome = parseFloat((Number(user.dailyIncome || 0) + Number(inv.daily || 0)).toFixed(2));
      inv.earned = parseFloat((Number(inv.earned || 0) + Number(inv.daily || 0)).toFixed(2));
      inv.lastEarned = now;

      await inv.save();
      await user.save();
      credited++;
      console.log(`✅ Credited KES ${inv.daily} to ${user.email}`);
    }
  }

  console.log(`✅ Earnings run complete — ${credited} investment(s) credited.`);
  return credited;
}

// ─── HTTP endpoint (called by Vercel Cron) ───────────────────────────────────
// GET /api/invest/cron/daily-earnings
// Protected by CRON_SECRET env var (sent as Authorization: Bearer <secret>)
router.get("/cron/daily-earnings", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (token !== cronSecret) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
  }

  try {
    const credited = await processEarnings();
    return res.status(200).json({ success: true, credited });
  } catch (err) {
    console.error("❌ Cron endpoint error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── In-process cron (backup — runs when server is awake on Render) ──────────
cron.schedule("* * * * *", async () => {
  try {
    await processEarnings();
  } catch (err) {
    console.error("❌ In-process cron error:", err.message);
  }
});

module.exports = router;