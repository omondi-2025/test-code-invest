const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

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

async function generateUniqueRefCode() {
  let refCode;
  let exists = true;

  while (exists) {
    refCode = Math.floor(10000 + Math.random() * 90000).toString();
    exists = await User.exists({ refCode });
  }

  return refCode;
}

// 🔐 SIGNUP
router.post('/signup', async (req, res) => {
  try {
    const { fullName, email, phone, password, ref } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim();
    const normalizedName = String(fullName || '').trim();
    const normalizedPassword = String(password || '');

    if (!normalizedName || !normalizedEmail || !normalizedPhone || !normalizedPassword) {
      return res.status(400).json({ success: false, message: '❗ All fields are required.' });
    }

    if (normalizedPassword.length < 6) {
      return res.status(400).json({ success: false, message: '❗ Password must be at least 6 characters.' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ success: false, message: '⚠️ Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
    const refCode = await generateUniqueRefCode();

    const newUser = new User({
      fullName: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      password: hashedPassword,
      wallet: 0,
      refCode,
      referredBy: ref || null,
      role: 'user'
    });

    await newUser.save();
    res.status(201).json({
      success: true,
      message: '✅ Registration successful.',
      user: cleanUserPayload(newUser),
    });
  } catch (err) {
    console.error('❌ Registration error:', err.message);
    res.status(500).json({ success: false, message: '🚫 Server error during registration.' });
  }
});

// 🔐 LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: '❗ Email and password are required.' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ success: false, message: '❌ User not found.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: '❌ Incorrect password.' });

    res.json({
      success: true,
      message: '✅ Login successful.',
      user: cleanUserPayload(user),
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ success: false, message: '🚫 Server error during login.' });
  }
});

// 🏦 WALLET BALANCE
router.get('/:id/wallet', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, wallet: user.wallet });
  } catch (err) {
    console.error('❌ Wallet fetch error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 👤 FETCH USER BY ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: '❌ User not found.' });

    res.json({ success: true, user });
  } catch (err) {
    console.error('❌ Fetch user error:', err.message);
    res.status(500).json({ success: false, message: '🚫 Failed to fetch user.' });
  }
});

module.exports = router;