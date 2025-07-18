const express = require('express');
const router = express.Router();

const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

// ✅ Test admin dashboard endpoint
router.get('/dashboard', (req, res) => {
  res.json({ message: '📊 Admin dashboard loaded' });
});

// ✅ Approve a deposit by ID
router.post('/approve-deposit/:id', async (req, res) => {
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
router.post('/approve-withdrawal/:id', async (req, res) => {
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

module.exports = router;