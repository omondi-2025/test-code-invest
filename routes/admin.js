const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
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

module.exports = router;
