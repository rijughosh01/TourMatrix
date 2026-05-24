/**
 * Travel Mood — AI-powered recommendations by how you want to feel.
 * Requires WanderLuxApi + trip catalog.
 */
(function () {
  "use strict";

  var MOODS = [
    {
      id: "stress-relief",
      label: "Stress Relief",
      hint: "Quiet beaches, nature & spa resorts",
    },
    {
      id: "romantic",
      label: "Romantic",
      hint: "Honeymoons, sunsets & couples escapes",
    },
    {
      id: "adventure",
      label: "Adventure",
      hint: "Hiking, mountains & active tours",
    },
    {
      id: "party",
      label: "Party",
      hint: "Nightlife, festivals & vibrant cities",
    },
    {
      id: "peaceful",
      label: "Peaceful",
      hint: "Serene landscapes & quiet retreats",
    },
    {
      id: "luxury",
      label: "Luxury",
      hint: "Premium resorts & exclusive stays",
    },
  ];

  var MOOD_MAP = {};
  MOODS.forEach(function (m) {
    MOOD_MAP[m.id] = m;
  });

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function formatMoney(n) {
    return Number(n || 0).toLocaleString("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    });
  }

  function getCatalogEntry(slug) {
    if (window.WANDERLUX_TRIP_CATALOG && window.WANDERLUX_TRIP_CATALOG[slug]) {
      return window.WANDERLUX_TRIP_CATALOG[slug];
    }
    return null;
  }

  function scoreTripForMood(slug, entry, moodId) {
    var score = 0;
    var styles = entry.styles || [];
    var moodRules = {
      "stress-relief": { styles: ["wellness", "beach"], budget: null },
      romantic: { styles: ["romantic", "beach"], budget: null },
      adventure: { styles: ["adventure"], budget: null },
      party: { styles: ["city", "beach"], budget: null },
      peaceful: { styles: ["wellness", "culture"], budget: null },
      luxury: { styles: ["romantic", "beach"], budget: "high" },
    };
    var rules = moodRules[moodId];
    if (!rules) return entry.rating || 0;

    rules.styles.forEach(function (s) {
      if (styles.indexOf(s) !== -1) score += 3;
    });
    if (rules.budget && entry.budgetTier === rules.budget) score += 2;
    score += (entry.rating || 0) / 10;
    score += (entry.popularity || 0) / 100;
    return score;
  }

  function fallbackRecommendations(moodId) {
    var catalog = window.WANDERLUX_TRIP_CATALOG || {};
    var mood = MOOD_MAP[moodId];
    var ranked = Object.keys(catalog)
      .map(function (slug) {
        return { slug: slug, entry: catalog[slug], score: scoreTripForMood(slug, catalog[slug], moodId) };
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, 3);

    var suggestions = ranked.map(function (item) {
      return Object.assign({ slug: item.slug }, item.entry);
    });

    if (!suggestions.length) {
      return {
        reply: "No trips matched this mood in our catalog yet. Try another mood or browse all packages.",
        slugs: [],
        suggestions: [],
        mood: mood ? { id: mood.id, label: mood.label } : null,
        fallback: true,
      };
    }

    return {
      reply:
        "Here are " +
        (mood ? mood.label.toLowerCase() : "matching") +
        " picks from our catalog — tap a package to book.",
      slugs: suggestions.map(function (s) {
        return s.slug;
      }),
      suggestions: suggestions,
      mood: mood ? { id: mood.id, label: mood.label } : null,
      fallback: true,
    };
  }

  function renderTripCard(slug, data) {
    var cat = getCatalogEntry(slug) || data || {};
    var title = cat.title || data.title || slug;
    var price = cat.price != null ? cat.price : data.price;
    var nights = cat.nights || data.nights || "?";
    var rating = cat.rating || data.rating;
    var image = cat.image || "";
    var imageAlt = cat.imageAlt || title;
    var desc = cat.desc || "";
    var styles = (cat.styles || data.styles || []).slice(0, 2);

    var tags = "";
    if (rating) {
      tags += '<span class="dest-card__tag"><span class="dest-card__star" aria-hidden="true">★</span> ' + rating + "</span>";
    }
    styles.forEach(function (s) {
      tags += '<span class="dest-card__tag">' + escapeHtml(s) + "</span>";
    });
    tags += '<span class="dest-card__tag">' + nights + " nights</span>";

    var media = image
      ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(imageAlt) + '" width="800" height="480" loading="lazy">'
      : "";

    return (
      '<article class="dest-card travel-mood-card" data-dest-id="' +
      escapeHtml(slug) +
      '">' +
      '<div class="dest-card__media">' +
      media +
      "</div>" +
      '<div class="dest-card__body">' +
      '<div class="dest-card__row">' +
      "<h3 class=\"dest-card__title\">" +
      escapeHtml(title) +
      "</h3>" +
      '<span class="dest-card__price"><span class="dest-card__price-inner">' +
      formatMoney(price) +
      "</span></span>" +
      "</div>" +
      (desc ? '<p class="dest-card__desc">' + escapeHtml(desc) + "</p>" : "") +
      '<div class="dest-card__tags">' +
      tags +
      "</div>" +
      '<button type="button" class="dest-card__cta js-book-dest">Book now</button>' +
      "</div>" +
      "</article>"
    );
  }

  function setLoading(root, loading) {
    var results = $("#travel-mood-results", root);
    if (!results) return;
    results.classList.toggle("is-loading", loading);
    if (loading) {
      results.innerHTML =
        '<div class="travel-mood__loading" role="status">' +
        '<div class="travel-mood__spinner" aria-hidden="true"></div>' +
        "<p>AI is finding trips for your mood…</p>" +
        "</div>";
    }
  }

  function showMoodError(root, message) {
    var results = $("#travel-mood-results", root);
    if (!results) return;
    results.classList.remove("is-loading");
    results.innerHTML =
      '<div class="travel-mood__error" role="alert">' +
      escapeHtml(message) +
      "</div>";
  }

  function renderResults(root, data, moodId) {
    var results = $("#travel-mood-results", root);
    var hint = $("#travel-mood-hint", root);
    var mood = MOOD_MAP[moodId];
    if (!results) return;

    if (hint && mood) {
      hint.textContent = mood.hint;
    }

    var suggestions = data.suggestions || [];
    var cardsHtml = suggestions
      .map(function (s) {
        return renderTripCard(s.slug, s);
      })
      .join("");

    results.classList.remove("is-loading");
    results.innerHTML =
      '<div class="travel-mood__reply">' +
      escapeHtml(data.reply || "Here are some ideas for you.") +
      (data.fallback ? ' <span class="travel-mood__fallback-note">(offline picks)</span>' : "") +
      "</div>" +
      (cardsHtml ? '<div class="grid-dest-cards travel-mood__cards">' + cardsHtml + "</div>" : "");

    if (window.WanderLuxMain && typeof window.WanderLuxMain.refreshDestCards === "function") {
      window.WanderLuxMain.refreshDestCards(results);
    } else {
      wireBookButtons(results);
    }
  }

  function wireBookButtons(container) {
    if (!container) return;
    $$(".js-book-dest", container).forEach(function (btn) {
      if (btn.getAttribute("data-bound") === "1") return;
      btn.setAttribute("data-bound", "1");
      btn.addEventListener("click", function () {
        var card = btn.closest(".dest-card");
        var id = card && card.getAttribute("data-dest-id");
        var trip = id && window.WANDERLUX_TRIP_CATALOG && window.WANDERLUX_TRIP_CATALOG[id];
        if (!id || !trip) {
          window.location.href = "booking.html";
          return;
        }
        if (window.WanderLuxApi && window.WanderLuxApi.startBooking) {
          window.WanderLuxApi.startBooking(id)
            .then(function (res) {
              localStorage.setItem(
                "wanderlux_pending_booking",
                JSON.stringify({ id: id, ref: res.ref, createdAt: new Date().toISOString() })
              );
              window.location.href = "checkout.html";
            })
            .catch(function (err) {
              var msg =
                window.WanderLuxApi && window.WanderLuxApi.formatApiError
                  ? window.WanderLuxApi.formatApiError(err, "Could not start booking. Try again.")
                  : (err && err.message) || "Could not start booking. Try again.";
              if (window.TourMatrixUi && window.TourMatrixUi.showModal) {
                window.TourMatrixUi.showModal("Booking unavailable", msg, true);
              } else {
                alert(msg);
              }
            });
        } else {
          window.location.href = "booking.html";
        }
      });
    });
  }

  function setActiveMood(root, moodId) {
    $$(".travel-mood__btn", root).forEach(function (btn) {
      var active = btn.getAttribute("data-mood") === moodId;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function loadMoodRecommendations(moodId, root) {
    if (!moodId || !MOOD_MAP[moodId]) return Promise.resolve();
    root = root || $("#travel-mood");
    if (!root) return Promise.resolve();

    setActiveMood(root, moodId);
    setLoading(root, true);

    var apiCall =
      window.WanderLuxApi && window.WanderLuxApi.aiRecommendByMood
        ? window.WanderLuxApi.aiRecommendByMood(moodId)
        : Promise.reject(new Error("API unavailable"));

    return apiCall
      .then(function (data) {
        renderResults(root, data, moodId);
        return data;
      })
      .catch(function (err) {
        var apiMsg =
          window.WanderLuxApi && window.WanderLuxApi.formatApiError
            ? window.WanderLuxApi.formatApiError(err)
            : (err && err.message) || "";
        var fallback = fallbackRecommendations(moodId);
        if (fallback.suggestions && fallback.suggestions.length) {
          fallback.reply =
            (apiMsg ? apiMsg + " " : "") +
            fallback.reply +
            " Showing offline picks from our catalog.";
          renderResults(root, fallback, moodId);
        } else {
          showMoodError(root, apiMsg || "Could not load recommendations. Check the API is running and try again.");
        }
      });
  }

  function initTravelMood() {
    var root = $("#travel-mood");
    if (!root || root.getAttribute("data-travel-mood-init") === "1") return;
    root.setAttribute("data-travel-mood-init", "1");

    $$(".travel-mood__btn", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var moodId = btn.getAttribute("data-mood");
        loadMoodRecommendations(moodId, root);
      });
    });
  }

  function initTravelMoodCompact() {
    var root = $("#travel-mood-compact");
    if (!root || root.getAttribute("data-travel-mood-init") === "1") return;
    root.setAttribute("data-travel-mood-init", "1");

    $$(".travel-mood__btn", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var moodId = btn.getAttribute("data-mood");
        var styleMap = {
          "stress-relief": "wellness",
          romantic: "romantic",
          adventure: "adventure",
          party: "city",
          peaceful: "wellness",
          luxury: "romantic",
        };
        var styleEl = $("#filter-style");
        if (styleEl && styleMap[moodId]) {
          styleEl.value = styleMap[moodId];
          styleEl.dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (window.AiAssistant && window.AiAssistant.sendMood) {
          window.AiAssistant.sendMood(moodId);
        } else if (window.TravelMood && window.TravelMood.openAiWithMood) {
          window.TravelMood.openAiWithMood(moodId);
        }

        $$(".travel-mood__btn", root).forEach(function (b) {
          var active = b.getAttribute("data-mood") === moodId;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-pressed", active ? "true" : "false");
        });
      });
    });
  }

  window.TravelMood = {
    MOODS: MOODS,
    MOOD_MAP: MOOD_MAP,
    init: initTravelMood,
    initCompact: initTravelMoodCompact,
    load: loadMoodRecommendations,
    fallback: fallbackRecommendations,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initTravelMood();
      initTravelMoodCompact();
    });
  } else {
    initTravelMood();
    initTravelMoodCompact();
  }
})();
