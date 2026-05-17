const express = require("express");
const { body, validationResult } = require("express-validator");
const ContactMessage = require("../models/ContactMessage");
const AppointmentRequest = require("../models/AppointmentRequest");

const router = express.Router();

router.post(
  "/contact",
  [
    body("name").trim().notEmpty(),
    body("email").isEmail().normalizeEmail(),
    body("topic").trim().notEmpty(),
    body("message").trim().isLength({ min: 10 }),
  ],
  async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Validation failed", details: errors.array() });
    }
    const { name, email, topic, message } = req.body;
    try {
      await ContactMessage.create({ name, email, topic, message });
      res.status(201).json({ ok: true, message: "Thank you — we will reply shortly." });
    } catch (e) {
      res.status(500).json({ error: "Could not save message" });
    }
  }
);

router.post(
  "/appointments",
  [
    body("fullName").trim().notEmpty(),
    body("email").isEmail().normalizeEmail(),
    body("phone").trim().notEmpty(),
    body("preferredDate").trim().notEmpty(),
    body("message").trim().notEmpty(),
  ],
  async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Validation failed", details: errors.array() });
    }
    const { fullName, email, phone, preferredDate, message } = req.body;
    try {
      await AppointmentRequest.create({
        fullName,
        email,
        phone,
        preferredDate,
        message,
      });
      res.status(201).json({ ok: true, message: "Appointment request received." });
    } catch (e) {
      res.status(500).json({ error: "Could not save appointment" });
    }
  }
);

module.exports = router;
