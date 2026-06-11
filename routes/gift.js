const express = require('express');
const router = express.Router();
const GiftCode = require('../models/GiftCode');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

// 🎁 POST /api/gift/redeem — redeem a gift code (one redemption per user per code)
router.post('/redeem', requireAuth, async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ success: false, message: '❗ Please enter a gift code.' });
    }

    const gift = await GiftCode.findOne({ code });
    if (!gift) {
      return res.status(404).json({ success: false, message: '❌ Invalid gift code.' });
    }

    const now = new Date();
    if (gift.expiresAt <= now) {
      return res.status(400).json({ success: false, message: '⌛ This gift code has expired.' });
    }

    const alreadyRedeemed = (gift.redemptions || []).some(
      (r) => String(r.userId) === String(req.userId)
    );
    if (alreadyRedeemed) {
      return res.status(400).json({ success: false, message: '⚠️ You have already redeemed this code.' });
    }

    if (gift.maxUses > 0 && (gift.redemptions || []).length >= gift.maxUses) {
      return res.status(400).json({ success: false, message: '❌ This gift code has been fully used.' });
    }

    // Atomic claim: re-check everything in the update condition so two
    // simultaneous requests can never double-redeem.
    const claimed = await GiftCode.findOneAndUpdate(
      {
        _id: gift._id,
        expiresAt: { $gt: now },
        'redemptions.userId': { $ne: req.userId },
        $expr: {
          $or: [
            { $eq: ['$maxUses', 0] },
            { $lt: [{ $size: '$redemptions' }, '$maxUses'] },
          ],
        },
      },
      { $push: { redemptions: { userId: req.userId, date: now } } },
      { new: true }
    );

    if (!claimed) {
      return res.status(400).json({ success: false, message: '❌ This gift code is no longer available.' });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.userId },
      { $inc: { wallet: gift.amount } },
      { new: true }
    );

    if (!user) {
      // Roll back the redemption so the code isn't burned for a ghost user
      await GiftCode.updateOne(
        { _id: gift._id },
        { $pull: { redemptions: { userId: req.userId } } }
      );
      return res.status(404).json({ success: false, message: '❌ User not found.' });
    }

    res.json({
      success: true,
      message: `🎉 Gift redeemed! KES ${gift.amount.toFixed(2)} added to your wallet.`,
      amount: gift.amount,
      wallet: user.wallet,
    });
  } catch (err) {
    console.error('❌ Gift redeem error:', err);
    res.status(500).json({ success: false, message: '🚫 Server error. Please try again.' });
  }
});

// 📜 GET /api/gift/history — own redemption history
router.get('/history', requireAuth, async (req, res) => {
  try {
    const gifts = await GiftCode.find({ 'redemptions.userId': req.userId })
      .select('code amount redemptions');

    const history = [];
    for (const g of gifts) {
      for (const r of g.redemptions) {
        if (String(r.userId) === String(req.userId)) {
          history.push({ code: g.code, amount: g.amount, date: r.date });
        }
      }
    }
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ success: true, history });
  } catch (err) {
    console.error('❌ Gift history error:', err);
    res.status(500).json({ success: false, message: '🚫 Failed to load gift history.' });
  }
});

module.exports = router;
