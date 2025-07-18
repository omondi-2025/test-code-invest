const mongoose = require("mongoose"); // ✅ REQUIRED

const investmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  daily: {
    type: Number,
    required: true
  },
  duration: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  earned: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Active', 'Completed'],
    default: 'Active'
  },
  lastEarned: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Investment', investmentSchema);