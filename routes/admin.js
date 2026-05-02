const express = require('express');
const router = express.Router();

const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAdminToken(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
}

// ── Admin login ──────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
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
router.get('/dashboard', requireAdminToken, async (req, res) => {
  try {
    const [pendingDeposits, pendingWithdrawals, users] = await Promise.all([
      Deposit.find({ status: 'pending' }).sort({ date: -1 }),
      Withdrawal.find({ status: 'pending' }).sort({ date: -1 }),
      User.find({}, 'fullName phone email'),
    ]);

    res.json({ success: true, pendingDeposits, pendingWithdrawals, users });
  } catch (err) {
    console.error('❌ Dashboard load error:', err);
    res.status(500).json({ success: false, message: '🚫 Server error loading dashboard.' });
  }
});

// ✅ Approve a deposit by ID
router.post('/approve-deposit/:id', requireAdminToken, async (req, res) => {
  try {
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) {
      return res.status(404).json({ message: '❌ Deposit not found' });
    }

    if (deposit.status === 'approved') {
      return res.status(400).json({ message: '⚠️ Already approved' });
    }

    const user = await User.findById(deposit.user);
    if (!user) {
      return res.status(404).json({ message: '❌ User not found' });
    }

    user.wallet += deposit.amount;
    await user.save();

    deposit.status = 'approved';
    await deposit.save();

    res.json({ success: true, message: '✅ Deposit approved', user });
  } catch (err) {
    console.error('❌ Deposit approval error:', err);
    res.status(500).json({ message: '🚫 Server error' });
  }
});

// ✅ Approve a withdrawal by ID
router.post('/approve-withdrawal/:id', requireAdminToken, async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ message: '❌ Withdrawal not found' });
    }

    if (withdrawal.status === 'approved') {
      return res.status(400).json({ message: '⚠️ Already approved' });
    }

    const user = await User.findById(withdrawal.user);
    if (!user) {
      return res.status(404).json({ message: '❌ User not found' });
    }

    withdrawal.status = 'approved';
    await withdrawal.save();

    res.json({ success: true, message: '✅ Withdrawal approved', user });
  } catch (err) {
    console.error('❌ Withdrawal approval error:', err);
    res.status(500).json({ message: '🚫 Server error' });
  }
});

// ✅ Reject a withdrawal by ID
router.post('/reject-withdrawal/:id', requireAdminToken, async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ message: '❌ Withdrawal not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ message: '⚠️ Only pending withdrawals can be rejected' });
    }

    withdrawal.status = 'rejected';
    await withdrawal.save();

    res.json({ success: true, message: '✅ Withdrawal rejected' });
  } catch (err) {
    console.error('❌ Withdrawal rejection error:', err);
    res.status(500).json({ message: '🚫 Server error' });
  }
});

module.exports = router;