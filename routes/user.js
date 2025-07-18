const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// 🔧 Helper: Generate a random 5-digit referral code
function generateRefCode() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

// 🔐 SIGNUP
router.post('/signup', async (req, res) => {
  try {
    const { fullName, email, phone, password, ref } = req.body;

    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: '❗ All fields are required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: '⚠️ Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      fullName,
      email,
      phone,
      password: hashedPassword,
      wallet: 0,
      refCode: generateRefCode(),
      referredBy: ref || null,
	  role: 'user' // ✅ ADD THIS LINE
    });

    await newUser.save();
    res.status(201).json({
  success: true,
  message: '✅ Registration successful.',
  user: {
    id: newUser._id,
    fullName: newUser.fullName,
    email: newUser.email,
    phone: newUser.phone,
    wallet: newUser.wallet,
    refCode: newUser.refCode,
    role: newUser.role
  }
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

    if (!email || !password) {
      return res.status(400).json({ success: false, message: '❗ Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: '❌ User not found.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: '❌ Incorrect password.' });

    res.json({
  success: true,
  message: '✅ Login successful.',
  user: {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    wallet: user.wallet,
    refCode: user.refCode,
    role: user.role // ✅ correct
  }
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