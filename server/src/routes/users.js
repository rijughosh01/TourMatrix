const express = require("express");
const { body, validationResult } = require("express-validator");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/me/saved", authRequired, function (req, res) {
  res.json({ slugs: req.user.savedSlugs || [] });
});

router.patch(
  "/me/saved",
  authRequired,
  [body("slugs").isArray()],
  async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "slugs must be an array" });
    }
    const slugs = req.body.slugs.map(function (s) {
      return String(s).trim();
    }).filter(Boolean);
    req.user.savedSlugs = slugs;
    await req.user.save();
    res.json({ slugs: req.user.savedSlugs });
  }
);

module.exports = router;
