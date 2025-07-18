const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  password: { type: String, required: true },

  wallet: { type: Number, default: 0 },
  refCode: { type: String, unique: true },
  referredBy: { type: String, default: null },
  role: { type: String, default: 'user' },

  // Dashboard stats
  expenses: { type: Number, default: 0 },
  cashouts: { type: Number, default: 0 },
  dailyIncome: { type: Number, default: 0 },

  // Referral tracking
  referralBonus: { type: Number, default: 0 },
  totalDeposits: { type: Number, default: 0 },
  totalInvested: { type: Number, default: 0 },
  referrals: [
    {
      userId: mongoose.Schema.Types.ObjectId,
      amount: Number,
      bonus: Number,
      date: Date
    }
  ],

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
