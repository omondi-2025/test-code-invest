require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Routes
const adminRoutes = require("./routes/admin");
const depositRoutes = require("./routes/deposit");
const investRoutes = require("./routes/invest");
const userRoutes = require("./routes/user");
const withdrawalRoutes = require("./routes/withdrawal");
const agentRoutes = require("./routes/agent");

app.use("/api/admin", adminRoutes);
app.use("/api/deposit", depositRoutes);
app.use("/api/invest", investRoutes);
app.use("/api/user", userRoutes);
app.use("/api/withdraw", withdrawalRoutes);
app.use("/api/agent", agentRoutes); // ✅ This line

// ✅ Safe fallback for frontend SPA (avoid path-to-regexp crash)
app.use((req, res, next) => {
  const url = req.originalUrl;

  // ❌ Block requests that look like external URLs
  if (/^https?:\/\//i.test(url)) {
    return res.status(400).send("Invalid route format.");
  }

  // ✅ Serve frontend index.html only for non-API routes
  if (!url.startsWith("/api") && req.method === "GET") {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }

  // Else pass through (404 will be handled or ignored)
  next();
});

// Start server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });