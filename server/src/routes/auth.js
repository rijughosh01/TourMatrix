const express = require("express");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const { authRequired, signUserToken } = require("../middleware/auth");

const router = express.Router();

router.post(
  "/register",
  [
    body("fullName").trim().notEmpty(),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 8 }),
  ],
  async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Invalid input", details: errors.array() });
    }
    const { fullName, email, password } = req.body;
    try {
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({
        fullName,
        email: email.toLowerCase(),
        passwordHash,
        role: "customer",
        isActive: true,
      });
      const token = signUserToken(user);
      res.status(201).json({
        token,
        user: user.toPublicJSON(),
      });
    } catch (e) {
      res.status(500).json({ error: "Registration failed" });
    }
  }
);

router.post(
  "/login",
  [body("email").isEmail().normalizeEmail(), body("password").notEmpty()],
  async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Invalid input", details: errors.array() });
    }
    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(401).json({ error: "Email or password is incorrect" });
      }
      if (user.isActive === false) {
        return res.status(403).json({ error: "Account is inactive" });
      }
      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        return res.status(401).json({ error: "Email or password is incorrect" });
      }
      user.lastLoginAt = new Date();
      await user.save();
      const token = signUserToken(user);
      res.json({
        token,
        user: user.toPublicJSON(),
      });
    } catch (e) {
      res.status(500).json({ error: "Login failed" });
    }
  }
);

router.get("/me", authRequired, function (req, res) {
  res.json({ user: req.user.toPublicJSON() });
});

module.exports = router;
