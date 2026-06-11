const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { signUserToken, requireAuth } = require('../middleware/auth');

// Brute-force protection on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
});

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
router.post('/signup', authLimiter, async (req, res) => {
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

    if (!/^(07|01)\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({ success: false, message: '❗ Phone must start with 07 or 01 and be 10 digits.' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ success: false, message: '⚠️ Email already registered.' });
    }

    // Only store a referrer that actually exists
    let referredBy = null;
    if (ref) {
      const referrer = await User.findOne({ refCode: String(ref).trim() });
      if (referrer) referredBy = referrer.refCode;
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
      referredBy,
      role: 'user'
    });

    // Sign the token BEFORE saving — if signing fails (e.g. missing secret)
    // we must not leave a half-created account behind.
    const token = signUserToken(newUser);

    await newUser.save();
    res.status(201).json({
      success: true,
      message: '✅ Registration successful.',
      token,
      user: cleanUserPayload(newUser),
    });
  } catch (err) {
    console.error('❌ Registration error:', err.message);
    res.status(500).json({ success: false, message: '🚫 Server error during registration.' });
  }
});

// 🔐 LOGIN
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: '❗ Email and password are required.' });
    }

    // Generic error for both cases — prevents user enumeration
    const user = await User.findOne({ email: normalizedEmail });
    const isMatch = user ? await bcrypt.compare(password, user.password) : false;
    if (!user || !isMatch) {
      return res.status(401).json({ success: false, message: '❌ Invalid email or password.' });
    }

    res.json({
      success: true,
      message: '✅ Login successful.',
      token: signUserToken(user),
      user: cleanUserPayload(user),
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ success: false, message: '🚫 Server error during login.' });
  }
});

// 🏦 WALLET BALANCE (own account only)
router.get('/me/wallet', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, wallet: user.wallet });
  } catch (err) {
    console.error('❌ Wallet fetch error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 👤 FETCH OWN PROFILE
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ success: false, message: '❌ User not found.' });

    res.json({ success: true, user });
  } catch (err) {
    console.error('❌ Fetch user error:', err.message);
    res.status(500).json({ success: false, message: '🚫 Failed to fetch user.' });
  }
});

// Legacy alias — older cached pages called GET /api/user/:id
router.get('/:id', requireAuth, async (req, res) => {
  if (String(req.params.id) !== String(req.userId)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ success: false, message: '❌ User not found.' });
    res.json({ success: true, user });
  } catch (err) {
    console.error('❌ Fetch user error:', err.message);
    res.status(500).json({ success: false, message: '🚫 Failed to fetch user.' });
  }
});

// Legacy alias — GET /api/user/:id/wallet
router.get('/:id/wallet', requireAuth, async (req, res) => {
  if (String(req.params.id) !== String(req.userId)) {
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
