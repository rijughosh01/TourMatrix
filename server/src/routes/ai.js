const express = require("express");
const { body, validationResult } = require("express-validator");
const Destination = require("../models/Destination");

const router = express.Router();

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

const CATALOG_TTL_MS = 5 * 60 * 1000;
let catalogCache = { at: 0, text: "", slugs: [], packages: [] };

async function loadCatalogContext() {
  const now = Date.now();
  if (catalogCache.text && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache;
  }
  const docs = await Destination.find({})
    .select("slug title price nights region styles budgetTier rating desc")
    .lean();
  const lines = docs.map(function (d) {
    const styles = (d.styles || []).join(",");
    return (
      d.slug +
      "|" +
      (d.title || d.slug) +
      "|$" +
      (d.price || 0) +
      "|" +
      (d.nights || 0) +
      "n|" +
      (d.region || "") +
      "|" +
      styles +
      "|" +
      (d.budgetTier || "") +
      "|★" +
      (d.rating || 0)
    );
  });
  catalogCache = {
    at: now,
    text: lines.join("\n"),
    slugs: docs.map(function (d) {
      return d.slug;
    }),
    packages: docs.map(function (d) {
      return {
        slug: d.slug,
        title: d.title || d.slug,
        price: d.price || 0,
        nights: d.nights || 0,
        region: d.region || "",
        styles: d.styles || [],
        budgetTier: d.budgetTier || "",
        rating: d.rating || 0,
      };
    }),
  };
  return catalogCache;
}

function buildSystemPrompt(catalog) {
  return (
    "You are TourMatrix AI, the travel assistant for TourMatrix Travel Agency (Australia).\n" +
    "Help visitors with this website: browse packages, Book a trip, checkout, Razorpay deposit payment, " +
    "My trips, wishlist (heart on cards), reviews after paid bookings, appointments, contact form, policies, login/register.\n\n" +
    "TRIP CATALOG — one package per line (slug|title|price AUD|nights|region|styles|budgetTier|rating):\n" +
    catalog.text +
    "\n\nRULES:\n" +
    "- Recommend at most 3 packages; use ONLY slugs from the catalog.\n" +
    "- Match user budget, nights, style (beach, city, adventure, culture, romantic, wellness), and region when asked.\n" +
    "- Prices are AUD per couple unless user asks otherwise.\n" +
    "- Reply in plain text (no HTML). Be concise, warm, and practical.\n" +
    '- Respond with JSON only: {"reply":"your message","slugs":["slug1","slug2"]}\n' +
    "- If no trip fits, give helpful advice and set slugs to []."
  );
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-8)
    .map(function (m) {
      var role = m && m.role === "assistant" ? "assistant" : "user";
      var content = String((m && m.content) || "")
        .trim()
        .slice(0, 1500);
      if (!content) return null;
      return { role: role, content: content };
    })
    .filter(Boolean);
}

function parseAiJson(content) {
  try {
    var parsed = JSON.parse(content);
    var reply = String(parsed.reply || "").trim();
    var slugs = Array.isArray(parsed.slugs) ? parsed.slugs : [];
    return { reply: reply || "Here are some ideas for your trip.", slugs: slugs };
  } catch (_) {
    return { reply: String(content || "").trim(), slugs: [] };
  }
}

router.get("/status", function (req, res) {
  res.json({
    configured: !!OPENAI_API_KEY,
    model: OPENAI_MODEL,
    hint: OPENAI_API_KEY
      ? "AI assistant is ready."
      : "Add OPENAI_API_KEY to server/.env and restart the API.",
  });
});

router.post(
  "/chat",
  [
    body("message").trim().isLength({ min: 1, max: 2000 }).withMessage("Message required"),
    body("history").optional().isArray(),
  ],
  async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg || "Invalid request" });
    }
    if (!OPENAI_API_KEY) {
      return res.status(503).json({
        error: "AI is not configured. Add OPENAI_API_KEY to server/.env and restart the API.",
      });
    }

    try {
      const catalog = await loadCatalogContext();
      if (!catalog.slugs.length) {
        return res.status(503).json({
          error: "No destinations in database. Run npm run seed in the server folder.",
        });
      }

      const userMessage = req.body.message.trim();
      const history = sanitizeHistory(req.body.history);
      const messages = [
        { role: "system", content: buildSystemPrompt(catalog) },
      ];
      history.forEach(function (m) {
        messages.push(m);
      });
      messages.push({ role: "user", content: userMessage });

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + OPENAI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 0.6,
          max_tokens: 800,
          response_format: { type: "json_object" },
          messages: messages,
        }),
      });

      const data = await openaiRes.json();
      if (!openaiRes.ok) {
        const errMsg =
          (data && data.error && data.error.message) || "OpenAI request failed";
        return res.status(502).json({ error: errMsg });
      }

      const content =
        data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : "";
      const parsed = parseAiJson(content);
      const slugSet = {};
      catalog.slugs.forEach(function (s) {
        slugSet[s] = true;
      });
      const validSlugs = parsed.slugs
        .map(function (s) {
          return String(s).trim();
        })
        .filter(function (s) {
          return s && slugSet[s];
        })
        .slice(0, 3);

      const suggestions = validSlugs.map(function (slug) {
        const pkg = catalog.packages.find(function (p) {
          return p.slug === slug;
        });
        return pkg || { slug: slug, title: slug };
      });

      res.json({
        reply: parsed.reply,
        slugs: validSlugs,
        suggestions: suggestions,
      });
    } catch (e) {
      console.error("[ai]", e);
      res.status(500).json({ error: "AI assistant failed. Try again shortly." });
    }
  }
);

module.exports = router;
