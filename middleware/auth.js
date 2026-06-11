const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

// Prefer a dedicated JWT_SECRET; fall back to a secret derived from
// ADMIN_TOKEN so deployments that haven't set JWT_SECRET yet keep working.
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.ADMIN_TOKEN ? process.env.ADMIN_TOKEN + ":user-jwt" : null);

if (!process.env.JWT_SECRET) {
  console.warn(
    JWT_SECRET
      ? "⚠️ JWT_SECRET not set — falling back to a secret derived from ADMIN_TOKEN. Set JWT_SECRET in your environment."
      : "❌ Neither JWT_SECRET nor ADMIN_TOKEN is set — user authentication WILL fail."
  );
}

const TOKEN_TTL = "7d";

// Signing always uses the primary secret
function signingSecret() {
  return JWT_SECRET;
}

// Accept tokens signed with the current OR previous fallback secret
// (covers deploys where JWT_SECRET was added/changed on the host).
function verifySecrets() {
  const secrets = [];
  if (process.env.JWT_SECRET) secrets.push(process.env.JWT_SECRET);
  const fallback = process.env.ADMIN_TOKEN ? process.env.ADMIN_TOKEN + ":user-jwt" : null;
  if (fallback && !secrets.includes(fallback)) secrets.push(fallback);
  if (!secrets.length && JWT_SECRET) secrets.push(JWT_SECRET);
  return secrets;
}

function signUserToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role || "user" },
    signingSecret(),
    { expiresIn: TOKEN_TTL }
  );
}

function verifyUserToken(token) {
  for (const secret of verifySecrets()) {
    try {
      return jwt.verify(token, secret);
    } catch {
      // try next secret
    }
  }
  return null;
}

// Verify a logged-in user. Sets req.userId / req.userRole.
function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  const payload = verifyUserToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
  }

  req.userId = payload.sub;
  req.userRole = payload.role || "user";
  next();
}

// Admin auth using the static ADMIN_TOKEN issued by /api/admin/login.
function requireAdmin(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}

// Guard against CastErrors from malformed ObjectIds.
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

module.exports = { signUserToken, verifyUserToken, requireAuth, requireAdmin, isValidId };
