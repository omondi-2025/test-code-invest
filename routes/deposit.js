const express = require('express');
const router = express.Router();
const Deposit = require('../models/Deposit');
const User = require('../models/User');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const MIN_DEPOSIT = 200;
// Accept the receiving number in local (0102188852) or international (254102188852) format.
const ACCOUNT_PATTERN = /(?:254|0)102188852/;

// Matches a genuine M-PESA confirmation:
// "TFC1A2B3C4 Confirmed. Ksh500.00 sent to JOHN DOE 0102188852 on 1/6/26 ..."
// Requires: 10-char code, "confirmed", a Ksh amount, "sent to", and our number.
const MPESA_FORMAT = /^([A-Z0-9]{10})\s+confirmed\.?\s+ksh\s?([\d,]+(?:\.\d{1,2})?)\s+sent\s+to\b/i;

// 📥 POST /api/deposit - Submit a new deposit request (own account only)
router.post('/', requireAuth, async (req, res) => {
  const { amount, message } = req.body;
  const normalizedAmount = Number(amount);
  const normalizedMessage = String(message || '').trim();

  if (!normalizedAmount || !normalizedMessage) {
    return res.status(400).json({ success: false, message: '❗ Amount and M-PESA message are required.' });
  }

  if (Number.isNaN(normalizedAmount) || normalizedAmount < MIN_DEPOSIT) {
    return res.status(400).json({ success: false, message: `❗ Minimum deposit is KES ${MIN_DEPOSIT}.` });
  }

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: '❌ User not found.' });

    // 1. Block reused messages
    const existing = await Deposit.findOne({ message: normalizedMessage });
    if (existing) {
      return res.status(400).json({ success: false, message: '❌ This M-PESA message has already been used.' });
    }

    // 2. Validate the message structure
    const match = normalizedMessage.match(MPESA_FORMAT);
    if (!match) {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid M-PESA format. Paste the confirmation SMS exactly as received.',
      });
    }

    // 3. The SMS must reference our receiving number
    if (!ACCOUNT_PATTERN.test(normalizedMessage)) {
      return res.status(400).json({
        success: false,
        message: '❌ This M-PESA message was not sent to our deposit number (0102188852).',
      });
    }

    // 4. The claimed amount must match the amount in the SMS
    const transactionCode = match[1].toUpperCase();
    const smsAmount = parseFloat(match[2].replace(/,/g, ''));
    if (Math.abs(smsAmount - normalizedAmount) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `❌ Amount mismatch: the SMS shows Ksh${smsAmount}, but you entered Ksh${normalizedAmount}.`,
      });
    }

    // 5. Block reused transaction codes (even if the message text was altered)
    const codeUsed = await Deposit.findOne({ transactionCode });
    if (codeUsed) {
      return res.status(400).json({ success: false, message: '❌ This transaction code has already been used.' });
    }

    const deposit = new Deposit({
      user: req.userId,
      amount: normalizedAmount,
      message: normalizedMessage,
      transactionCode,
      status: 'pending',
      date: new Date(),
    });

    await deposit.save();

    res.status(201).json({ success: true, message: '✅ Deposit submitted and awaiting admin approval.' });
  } catch (error) {
    console.error('❌ Error creating deposit:', error);
    res.status(500).json({ success: false, message: '🚫 Internal server error.' });
  }
});

// ✅ GET /api/deposit/all - Admin: view all deposits with user info
// NOTE: must be declared before any parameterized GET routes.
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const deposits = await Deposit.find()
      .sort({ date: -1 })
      .populate({
        path: 'user',
        select: 'fullName phone email'
      });

    res.json({ success: true, deposits });
  } catch (err) {
    console.error('❌ Admin deposit fetch error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 📄 GET /api/deposit - Fetch own deposit history
router.get('/', requireAuth, async (req, res) => {
  try {
    const deposits = await Deposit.find({ user: req.userId }).sort({ date: -1 });
    res.status(200).json({ success: true, deposits });
  } catch (error) {
    console.error('❌ Error fetching deposits:', error);
    res.status(500).json({ success: false, message: '🚫 Failed to fetch deposits.' });
  }
});

// 📤 GET /api/deposit/balance - Own wallet balance
router.get('/balance', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, wallet: user.wallet });
  } catch (err) {
    console.error('❌ Wallet fetch error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Legacy alias — older cached pages called GET /api/deposit/balance/:userId
router.get('/balance/:userId', requireAuth, async (req, res) => {
  if (String(req.params.userId) !== String(req.userId)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, wallet: user.wallet });
  } catch (err) {
    console.error('❌ Wallet fetch error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
