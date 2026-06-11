const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const GiftCode = require('../models/GiftCode');
const { requireAdmin } = require('../middleware/auth');

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' },
});

// ── Admin login ──────────────────────────────────────────────────────────────
router.post('/login', adminLoginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    return res.json({ success: true, token: process.env.ADMIN_TOKEN });
  }
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Dashboard payload consumed by public/admin.html
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const [pendingDeposits, pendingWithdrawals, users] = await Promise.all([
      Deposit.find({ status: 'pending' })
        .sort({ date: -1 })
        .populate({ path: 'user', select: 'fullName phone email' }),
      Withdrawal.find({ status: 'pending' })
        .sort({ date: -1 })
        .populate({ path: 'user', select: 'fullName phone email' }),
      User.find({}, 'fullName phone email wallet'),
    ]);

    res.json({ success: true, pendingDeposits, pendingWithdrawals, users });
  } catch (err) {
    console.error('❌ Dashboard load error:', err);
    res.status(500).json({ success: false, message: '🚫 Server error loading dashboard.' });
  }
});

// ✅ Approve a deposit by ID
router.post('/approve-deposit/:id', requireAdmin, async (req, res) => {
  try {
    // Atomically flip pending → approved so double-clicks can't credit twice
    const deposit = await Deposit.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: 'approved' } },
      { new: true }
    );

    if (!deposit) {
      return res.status(404).json({ success: false, message: '❌ Deposit not found or already processed' });
    }

    const user = await User.findOneAndUpdate(
      { _id: deposit.user },
      { $inc: { wallet: deposit.amount, totalDeposits: deposit.amount } },
      { new: true }
    );

    if (!user) {
      // Roll back the status so the deposit isn't stuck approved with no credit
      deposit.status = 'pending';
      await deposit.save();
      return res.status(404).json({ success: false, message: '❌ User not found' });
    }

    res.json({ success: true, message: '✅ Deposit approved' });
  } catch (err) {
    console.error('❌ Deposit approval error:', err);
    res.status(500).json({ success: false, message: '🚫 Server error' });
  }
});

// ✅ Approve a withdrawal by ID
router.post('/approve-withdrawal/:id', requireAdmin, async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: 'approved' } },
      { new: true }
    );

    if (!withdrawal) {
      return res.status(404).json({ success: false, message: '❌ Withdrawal not found or already processed' });
    }

    res.json({ success: true, message: '✅ Withdrawal approved' });
  } catch (err) {
    console.error('❌ Withdrawal approval error:', err);
    res.status(500).json({ success: false, message: '🚫 Server error' });
  }
});

// ✅ Reject a withdrawal by ID — refunds the gross amount to the wallet
router.post('/reject-withdrawal/:id', requireAdmin, async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: 'rejected' } },
      { new: true }
    );

    if (!withdrawal) {
      return res.status(404).json({ success: false, message: '❌ Withdrawal not found or already processed' });
    }

    // Refund: wallet was debited (gross) when the request was made
    await User.findOneAndUpdate(
      { _id: withdrawal.user },
      { $inc: { wallet: withdrawal.amount, cashouts: -withdrawal.amount } }
    );

    res.json({ success: true, message: '✅ Withdrawal rejected and amount refunded' });
  } catch (err) {
    console.error('❌ Withdrawal rejection error:', err);
    res.status(500).json({ success: false, message: '🚫 Server error' });
  }
});

// ── Gift codes ───────────────────────────────────────────────────────────────

function generateGiftCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'GIFT-' + s;
}

// 🎁 POST /api/admin/gift-codes — create a gift code
// Body: { amount, validHours, maxUses? }
router.post('/gift-codes', requireAdmin, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const validHours = Number(req.body.validHours);
    const maxUses = Math.max(0, parseInt(req.body.maxUses, 10) || 0);

    if (!amount || amount < 1) {
      return res.status(400).json({ success: false, message: '❗ Enter a valid gift amount.' });
    }
    if (!validHours || validHours < 1) {
      return res.status(400).json({ success: false, message: '❗ Enter a valid duration (hours).' });
    }

    // Retry on the (unlikely) chance of a duplicate code
    let gift = null;
    for (let attempt = 0; attempt < 5 && !gift; attempt++) {
      try {
        gift = await GiftCode.create({
          code: generateGiftCode(),
          amount,
          maxUses,
          expiresAt: new Date(Date.now() + validHours * 60 * 60 * 1000),
        });
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
    }
    if (!gift) {
      return res.status(500).json({ success: false, message: '🚫 Could not generate a unique code. Try again.' });
    }

    res.status(201).json({ success: true, message: '✅ Gift code created.', gift });
  } catch (err) {
    console.error('❌ Gift code creation error:', err);
    res.status(500).json({ success: false, message: '🚫 Server error creating gift code.' });
  }
});

// 📋 GET /api/admin/gift-codes — list all gift codes with usage info
router.get('/gift-codes', requireAdmin, async (req, res) => {
  try {
    const codes = await GiftCode.find().sort({ createdAt: -1 }).limit(100);
    const now = Date.now();

    const list = codes.map((g) => ({
      _id: g._id,
      code: g.code,
      amount: g.amount,
      maxUses: g.maxUses,
      uses: (g.redemptions || []).length,
      createdAt: g.createdAt,
      expiresAt: g.expiresAt,
      expired: new Date(g.expiresAt).getTime() <= now,
      fullyUsed: g.maxUses > 0 && (g.redemptions || []).length >= g.maxUses,
    }));

    res.json({ success: true, codes: list });
  } catch (err) {
    console.error('❌ Gift code list error:', err);
    res.status(500).json({ success: false, message: '🚫 Server error loading gift codes.' });
  }
});

module.exports = router;
