const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

// Rate limit: 100 per minute per IP
const shareLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: "Too many share events from this IP",
});

// Store share events (can be enhanced with database)
let shareEvents = [];

/**
 * POST /api/shares/track
 * Track a social share event
 */
router.post("/track", shareLimiter, (req, res) => {
  try {
    const { platform, tripSlug, timestamp, userAgent } = req.body;

    if (!platform || !tripSlug) {
      return res.status(400).json({ error: "platform and tripSlug required" });
    }

    const event = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      platform,
      tripSlug,
      timestamp: timestamp || new Date().toISOString(),
      userAgent: userAgent || "unknown",
      ip: req.ip,
    };

    shareEvents.push(event);

    // Keep only last 1000 events in memory
    if (shareEvents.length > 1000) {
      shareEvents = shareEvents.slice(-1000);
    }

    res.json({ success: true, eventId: event.id });
  } catch (err) {
    console.error("Share tracking error:", err);
    res.status(500).json({ error: "Failed to track share" });
  }
});

/**
 * GET /api/shares/stats
 * Get share statistics (admin only - optional)
 */
router.get("/stats", (req, res) => {
  try {
    const stats = {};
    shareEvents.forEach((event) => {
      if (!stats[event.tripSlug]) {
        stats[event.tripSlug] = {};
      }
      if (!stats[event.tripSlug][event.platform]) {
        stats[event.tripSlug][event.platform] = 0;
      }
      stats[event.tripSlug][event.platform]++;
    });

    res.json({
      total: shareEvents.length,
      events: shareEvents.slice(-50), // Return last 50 events
      stats,
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

/**
 * GET /api/shares/trip/:slug
 * Get share count for a specific trip
 */
router.get("/trip/:slug", (req, res) => {
  try {
    const { slug } = req.params;
    const tripEvents = shareEvents.filter((e) => e.tripSlug === slug);

    const byPlatform = {};
    tripEvents.forEach((event) => {
      byPlatform[event.platform] = (byPlatform[event.platform] || 0) + 1;
    });

    res.json({
      tripSlug: slug,
      total: tripEvents.length,
      byPlatform,
    });
  } catch (err) {
    console.error("Trip stats error:", err);
    res.status(500).json({ error: "Failed to get trip stats" });
  }
});

module.exports = router;
