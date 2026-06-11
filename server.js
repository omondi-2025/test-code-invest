require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// Behind Render/Vercel proxies — needed for express-rate-limit to see real IPs
app.set("trust proxy", 1);

// Middleware
app.use(cors());
app.use(express.json({ limit: "50kb" }));
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
app.use("/api/agent", agentRoutes);

// ✅ Health / keep-alive ping
app.get("/api/ping", (req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
});

// ✅ SPA fallback — only for page-like GET routes.
// Requests that look like files (have an extension) get a real 404 so
// broken asset links are visible and never poison the service worker cache.
app.use((req, res, next) => {
  const url = req.originalUrl;

  if (/^https?:\/\//i.test(url)) {
    return res.status(400).send("Invalid route format.");
  }

  if (url.startsWith("/api")) {
    return res.status(404).json({ success: false, message: "Not found" });
  }

  if (req.method === "GET") {
    const hasExtension = /\.[a-zA-Z0-9]+(\?|$)/.test(url);
    if (hasExtension) {
      return res.status(404).send("Not found");
    }
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }

  next();
});

// Connect with a DNS fallback: some networks block Node's SRV lookups even
// though the system resolver works — retry once using public DNS servers.
async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (err) {
    if (/querySrv/i.test(err.message)) {
      console.warn("⚠️ SRV lookup failed, retrying with public DNS…");
      require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
      await mongoose.connect(process.env.MONGO_URI);
    } else {
      throw err;
    }
  }
}

// Start server
connectMongo()
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);

      // ── Keep Render free tier awake (self-ping every 14 minutes) ──────────
      const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
      setInterval(() => {
        const http = SELF_URL.startsWith("https") ? require("https") : require("http");
        http.get(`${SELF_URL}/api/ping`, () => {
          console.log(`🏓 Self-ping OK — ${new Date().toISOString()}`);
        }).on("error", (err) => {
          console.warn("⚠️ Self-ping failed:", err.message);
        });
      }, 14 * 60 * 1000);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });
