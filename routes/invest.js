const express = require("express");
const router = express.Router();
const cron = require("node-cron");
const Investment = require("../models/Investment");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

// Single source of truth for plans — the frontend list must match.
const PLANS = {
  1: 400,
  2: 800,
  3: 1800,
  4: 2800,
  5: 3500,
  6: 5000,
  7: 8500,
  8: 15000,
  9: 30000,
};
const DAILY_RATE = 0.10;
const DURATION_DAYS = 100;
const REFERRAL_RATE = 0.20;

function cleanUserPayload(user) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    wallet: user.wallet,
    refCode: user.refCode,
    role: user.role,
    cashouts: user.cashouts,
    expenses: user.expenses,
    dailyIncome: user.dailyIncome,
  };
}

// 📥 POST /api/invest — Create a new investment (own account only)
router.post("/", requireAuth, async (req, res) => {
  const { planId } = req.body;
  const amount = PLANS[planId];

  if (!amount) {
    return res.status(400).json({ success: false, message: "❌ Invalid investment plan." });
  }

  try {
    // Atomic deduction: only succeeds if the wallet still covers the amount,
    // which prevents double-spending via concurrent requests.
    const user = await User.findOneAndUpdate(
      { _id: req.userId, wallet: { $gte: amount } },
      { $inc: { wallet: -amount, expenses: amount, totalInvested: amount } },
      { new: true }
    );

    if (!user) {
      const exists = await User.exists({ _id: req.userId });
      if (!exists) return res.status(404).json({ success: false, message: "❌ User not found." });
      return res.status(400).json({ success: false, message: "❌ Insufficient wallet balance." });
    }

    const dailyProfit = parseFloat((amount * DAILY_RATE).toFixed(2));

    const newInvestment = new Investment({
      userId: user._id,
      amount,
      daily: dailyProfit,
      duration: `${DURATION_DAYS} days`,
      startDate: new Date(),
      endDate: new Date(Date.now() + DURATION_DAYS * 24 * 60 * 60 * 1000),
      earned: 0,
      status: "Active",
    });

    await newInvestment.save();

    // ✅ Referral bonus — first investment only (matches the advertised rule)
    if (user.referredBy) {
      const previousInvestments = await Investment.countDocuments({
        userId: user._id,
        _id: { $ne: newInvestment._id },
      });

      if (previousInvestments === 0) {
        const bonus = parseFloat((amount * REFERRAL_RATE).toFixed(2));
        await User.findOneAndUpdate(
          { refCode: user.referredBy },
          {
            $inc: { wallet: bonus, referralBonus: bonus },
            $push: {
              referrals: { userId: user._id, amount, bonus, date: new Date() },
            },
          }
        );
      }
    }

    res.status(201).json({
      success: true,
      message: "✅ Investment created.",
      user: cleanUserPayload(user),
      investment: newInvestment,
    });

  } catch (err) {
    console.error("❌ Investment creation error:", err);
    res.status(500).json({ success: false, message: "🚫 Server error. Please try again." });
  }
});

// 📤 GET /api/invest — Get own investments
// NOTE: expired investments are completed by processEarnings(), which pays
// any outstanding days first — never mark them Completed here.
router.get("/", requireAuth, async (req, res) => {
  try {
    const investments = await Investment.find({ userId: req.userId }).sort({ startDate: -1 });
    res.status(200).json({ success: true, investments });
  } catch (err) {
    console.error("❌ Error fetching investments:", err);
    res.status(500).json({ success: false, message: "🚫 Failed to fetch investments." });
  }
});

// ─── Shared earnings processing logic ───────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;

async function processEarnings() {
  const now = new Date();
  const investments = await Investment.find({ status: "Active" });
  let credited = 0;

  for (const inv of investments) {
    const daily = Number(inv.daily || 0);
    const last = inv.lastEarned ? new Date(inv.lastEarned) : new Date(inv.startDate);
    const end = new Date(inv.endDate);
    const expired = end.getTime() <= now.getTime();

    // Pay every full 24h period since the last payout, but never past endDate.
    const payUntil = expired ? end : now;
    const periodsDue = Math.floor((payUntil.getTime() - last.getTime()) / DAY_MS);

    if (periodsDue <= 0) {
      // Nothing left to pay — close out expired investments.
      if (expired) {
        await Investment.updateOne(
          { _id: inv._id, status: "Active" },
          { $set: { status: "Completed" } }
        );
      }
      continue;
    }

    const amount = parseFloat((daily * periodsDue).toFixed(2));
    // Advance by exact 24h multiples so payout times never drift.
    const newLastEarned = new Date(last.getTime() + periodsDue * DAY_MS);

    const update = {
      $set: { lastEarned: newLastEarned },
      $inc: { earned: amount },
    };
    if (expired) update.$set.status = "Completed";

    // Atomically claim this payout. If another process (second instance,
    // external cron) already advanced lastEarned, this matches nothing
    // and we skip — prevents double-crediting.
    const claimed = await Investment.findOneAndUpdate(
      { _id: inv._id, status: "Active", lastEarned: inv.lastEarned },
      update,
      { new: true }
    );
    if (!claimed) continue;

    const user = await User.findOneAndUpdate(
      { _id: inv.userId },
      { $inc: { wallet: amount, dailyIncome: amount } },
      { new: true }
    );
    if (!user) continue;

    credited++;
    console.log(`✅ Credited KES ${amount} (${periodsDue} day(s)) to ${user.email}`);
  }

  if (credited > 0) {
    console.log(`✅ Earnings run complete — ${credited} investment(s) credited.`);
  }
  return credited;
}

// ─── HTTP endpoint (called by external cron) ────────────────────────────────
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

// ─── In-process cron (backup — runs when server is awake) ───────────────────
// Every 10 minutes is plenty; payouts are due once per 24h per investment.
cron.schedule("*/10 * * * *", async () => {
  try {
    await processEarnings();
  } catch (err) {
    console.error("❌ In-process cron error:", err.message);
  }
});

module.exports = router;
module.exports.processEarnings = processEarnings;
