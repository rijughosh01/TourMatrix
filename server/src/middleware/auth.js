const jwt = require("jsonwebtoken");
const User = require("../models/User");

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function authRequired(req, res, next) {
  const token = getBearerToken(req);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "Authentication service is unavailable" });
  }
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(token, secret);
    if (!payload.sub) {
      return res.status(401).json({ error: "Invalid token" });
    }
    User.findById(payload.sub)
      .then(function (user) {
        if (!user) {
          return res.status(401).json({ error: "User not found" });
        }
        if (user.isActive === false) {
          return res.status(403).json({ error: "Account is inactive" });
        }
        req.user = user;
        req.userId = user._id.toString();
        next();
      })
      .catch(function () {
        res.status(401).json({ error: "Unauthorized" });
      });
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function optionalAuth(req, res, next) {
  const token = getBearerToken(req);
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) {
    return next();
  }
  try {
    const payload = jwt.verify(token, secret);
    if (!payload.sub) return next();
    User.findById(payload.sub)
      .then(function (user) {
        if (user && user.isActive !== false) {
          req.user = user;
          req.userId = user._id.toString();
        }
        next();
      })
      .catch(function () {
        next();
      });
  } catch (e) {
    next();
  }
}

function signUserToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role || "customer" },
    secret,
    { expiresIn: "14d" }
  );
}

function adminRequired(req, res, next) {
  authRequired(req, res, function () {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  });
}

module.exports = {
  authRequired,
  adminRequired,
  optionalAuth,
  signUserToken,
  getBearerToken,
};
