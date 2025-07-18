const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");

// Submit Withdrawal Request
exports.submitWithdrawal = async (req, res) => {
  const { userId, amount, mpesa } = req.body;

  if (!userId || !amount || !mpesa) {
    return res.status(400).json({ success: false, message: "Missing required fields." });
  }

  if (amount < 150) {
    return res.status(400).json({ success: false, message: "Minimum withdrawal is KES 150." });
  }

  const now = new Date();
  const hour = now.getHours();
  if (hour < 9 || hour > 18) {
    return res.status(403).json({ success: false, message: "Withdrawals allowed only from 9am to 6pm." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingToday = await Withdrawal.findOne({
      userId,
      date: { $gte: today },
    });

    if (existingToday) {
      return res.status(400).json({ success: false, message: "You can only withdraw once per day." });
    }

    const tax = amount * 0.15;
    const amountAfterTax = amount - tax;

    const newWithdrawal = new Withdrawal({
      userId,
      amount,
      amountAfterTax,
      tax,
      mpesa,
      status: "pending",
      date: now,
    });

    await newWithdrawal.save();
    return res.json({ success: true, message: "Withdrawal request submitted." });

  } catch (err) {
    console.error("Submit Withdrawal Error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// Get user's withdrawal history
exports.getUserWithdrawals = async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ success: false, message: "User ID required." });

  try {
    const records = await Withdrawal.find({ userId }).sort({ date: -1 });
    return res.json(records);
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch history." });
  }
};

// Admin: Approve Withdrawal
exports.approveWithdrawal = async (req, res) => {
  const { id } = req.params;

  try {
    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal || withdrawal.status !== "pending") {
      return res.status(404).json({ success: false, message: "Withdrawal not found or already processed." });
    }

    const user = await User.findById(withdrawal.userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    if (user.wallet < withdrawal.amount) {
      return res.status(400).json({ success: false, message: "Insufficient balance." });
    }

    // Deduct amount from user's wallet
    user.wallet -= withdrawal.amount;
    await user.save();

    withdrawal.status = "approved";
    await withdrawal.save();

    return res.json({ success: true, message: "Withdrawal approved and balance updated." });
  } catch (err) {
    console.error("Approval error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// Admin: Reject Withdrawal
exports.rejectWithdrawal = async (req, res) => {
  const { id } = req.params;
  try {
    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal || withdrawal.status !== "pending") {
      return res.status(404).json({ success: false, message: "Withdrawal not found or already processed." });
    }

    withdrawal.status = "rejected";
    await withdrawal.save();

    return res.json({ success: true, message: "Withdrawal rejected." });
  } catch (err) {
    console.error("Rejection error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};