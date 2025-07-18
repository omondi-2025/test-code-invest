const express = require('express');
const router = express.Router();
const Deposit = require('../models/Deposit');
const User = require('../models/User');

// 📥 POST /api/deposit - Submit a new deposit request
router.post('/', async (req, res) => {
  const { userId, amount, message } = req.body;

  if (!userId || !amount || !message) {
    return res.status(400).json({ success: false, message: '❗ All fields (userId, amount, message) are required.' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: '❌ User not found.' });

    // 1. Block reused messages
    const existing = await Deposit.findOne({ message });
    if (existing) {
      return res.status(400).json({ success: false, message: '❌ This M-PESA message has already been used.' });
    }

    // 2. Enforce strict message format and number
    const format = /^[A-Z0-9]{10} confirmed\. Ksh\d+(\.\d{1,2})? sent to AIRTEL MONEY  for account 254102188852\b/i;
    if (!format.test(message.trim())) {
      return res.status(400).json({ success: false, message: '❌ Invalid M-PESA format. Make sure the message is exactly as received and includes the correct account number.' });
    }

    // 3. Extract code
    const codeMatch = message.match(/^([A-Z0-9]{10})/);
    const transactionCode = codeMatch ? codeMatch[1] : "UNKNOWN";

    const deposit = new Deposit({
      user: userId,
      amount,
      message,
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

// 📄 GET /api/deposit?userId=xxx - Fetch user’s deposit history
router.get('/', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ success: false, message: '❗ Missing userId in query.' });
  }

  try {
    const deposits = await Deposit.find({ user: userId }).sort({ date: -1 });

    res.status(200).json({ success: true, deposits });
  } catch (error) {
    console.error('❌ Error fetching deposits:', error);
    res.status(500).json({ success: false, message: '🚫 Failed to fetch deposits.' });
  }
});

// 📤 GET /api/deposit/balance/:userId - Get wallet balance
router.get('/balance/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, wallet: user.wallet });
  } catch (err) {
    console.error('❌ Wallet fetch error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ GET /api/deposit/all - Admin: view all deposits with user info
router.get('/all', async (req, res) => {
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

module.exports = router;