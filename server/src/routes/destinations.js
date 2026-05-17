const express = require("express");
const Destination = require("../models/Destination");

const router = express.Router();

router.get("/catalog", async function (req, res) {
  try {
    const docs = await Destination.find({}).lean();
    const catalog = {};
    docs.forEach(function (d) {
      const { slug, _id, __v, createdAt, updatedAt, ...rest } = d;
      catalog[slug] = rest;
    });
    res.json({ catalog });
  } catch (e) {
    res.status(500).json({ error: "Failed to load catalog" });
  }
});

router.get("/", async function (req, res) {
  try {
    const docs = await Destination.find({}).sort({ slug: 1 }).lean();
    res.json({ destinations: docs });
  } catch (e) {
    res.status(500).json({ error: "Failed to list destinations" });
  }
});

module.exports = router;
