(function () {
  "use strict";

  var STORAGE_USERS = "wanderlux_users";
  var STORAGE_SESSION = "wanderlux_session";
  var STORAGE_PENDING = "wanderlux_pending_booking";
  var STORAGE_SAVED = "wanderlux_saved_destinations";
  var STORAGE_BOOKINGS = "wanderlux_bookings_history";
  var STORAGE_CHECKOUT_DRAFT = "wanderlux_checkout_draft";
  var THEME_KEY = "wanderlux_theme";
  var HEART_SVG =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  function getCatalog() {
    return typeof window !== "undefined" && window.WANDERLUX_TRIP_CATALOG
      ? window.WANDERLUX_TRIP_CATALOG
      : {};
  }

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  function getUsers() {
    try {
      var raw = localStorage.getItem(STORAGE_USERS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
  }

  function getSession() {
    if (typeof window !== "undefined" && window.WanderLuxApi && WanderLuxApi.getCurrentUser()) {
      var u = WanderLuxApi.getCurrentUser();
      return { email: u.email, fullName: u.fullName, role: u.role || "customer" };
    }
    try {
      var raw = localStorage.getItem(STORAGE_SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(user) {
    if (user) {
      localStorage.setItem(
        STORAGE_SESSION,
        JSON.stringify({ email: user.email, fullName: user.fullName, role: user.role || "customer" })
      );
    } else {
      localStorage.removeItem(STORAGE_SESSION);
    }
  }

  function starsHtml(rating) {
    var n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    var out = "";
    for (var i = 0; i < 5; i++) {
      out += i < n ? "★" : "☆";
    }
    return out;
  }

  function applyTheme(theme) {
    var next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      /* ignore */
    }
    var btn = $("#theme-toggle");
    if (btn) {
      var isDark = next === "dark";
      btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      btn.setAttribute("title", isDark ? "Light mode" : "Dark mode");
      btn.innerHTML = isDark
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
    }
  }

  function initTheme() {
    var stored = "";
    try {
      stored = localStorage.getItem(THEME_KEY) || "";
    } catch (e) {
      stored = "";
    }
    if (stored === "dark" || stored === "light") {
      applyTheme(stored);
      return;
    }
    var prefersDark =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }

  function initThemeToggle() {
    if ($("#theme-toggle")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "theme-toggle";
    btn.className = "theme-toggle theme-toggle--fab";
    document.body.appendChild(btn);
    btn.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
    applyTheme(document.documentElement.getAttribute("data-theme") || "light");
  }

  function ensureApiStatusBanner() {
    var el = document.getElementById("api-status-banner");
    if (el) return el;
    el = document.createElement("div");
    el.id = "api-status-banner";
    el.className = "api-status-banner";
    el.setAttribute("role", "status");
    el.hidden = true;
    var header = $(".site-header");
    if (header && header.parentNode) {
      header.parentNode.insertBefore(el, header.nextSibling);
    } else {
      document.body.insertBefore(el, document.body.firstChild);
    }
    return el;
  }

  function updateApiStatusBanner() {
    if (!window.WanderLuxApi || typeof WanderLuxApi.getCatalogLoadState !== "function") return;
    var banner = ensureApiStatusBanner();
    var st = WanderLuxApi.getCatalogLoadState();
    if (st.status === "loading") {
      banner.hidden = false;
      banner.className = "api-status-banner";
      banner.textContent = "Loading latest trips from the server…";
      return;
    }
    if (st.status === "error") {
      banner.hidden = false;
      banner.className = "api-status-banner api-status-banner--error";
      banner.innerHTML =
        "Could not reach the API (" +
        escapeHtml(st.error || "network error") +
        '). Showing offline catalogue. <span class="api-status-banner__actions"><button type="button" class="api-status-banner__btn" id="api-retry-btn">Retry</button></span>';
      var retry = $("#api-retry-btn");
      if (retry) {
        retry.onclick = function () {
          showCatalogSkeletons();
          WanderLuxApi.bootstrap()
            .finally(function () {
              hideCatalogSkeletons();
              updateApiStatusBanner();
              hydrateCatalogMeta();
              syncBookmarkButtons();
              filterAndSortTripCards();
            });
        };
      }
      return;
    }
    if (st.slow) {
      banner.hidden = false;
      banner.className = "api-status-banner api-status-banner--warn";
      banner.textContent =
        "The server was waking up (Render cold start). Trip data may have loaded from your offline catalogue first.";
      return;
    }
    banner.hidden = true;
    banner.textContent = "";
  }

  function skeletonCardHtml() {
    return (
      '<article class="dest-card dest-card--skeleton" aria-hidden="true">' +
      '<div class="sk-media"></div>' +
      '<div class="sk-body"><div class="sk-line sk-line--title"></div>' +
      '<div class="sk-line"></div><div class="sk-line sk-line--short"></div></div></article>'
    );
  }

  function showCatalogSkeletons() {
    $$(".grid-dest-cards, #trip-catalog-grid").forEach(function (grid) {
      if (grid.querySelector(".catalog-skeleton-grid")) return;
      grid.classList.add("is-loading");
      var sk = document.createElement("div");
      sk.className = "catalog-skeleton-grid";
      sk.setAttribute("aria-hidden", "true");
      var html = "";
      for (var i = 0; i < 6; i++) {
        html += skeletonCardHtml();
      }
      sk.innerHTML = html;
      grid.insertBefore(sk, grid.firstChild);
    });
  }

  function hideCatalogSkeletons() {
    $$(".catalog-skeleton-grid").forEach(function (el) {
      el.remove();
    });
    $$(".grid-dest-cards.is-loading, #trip-catalog-grid.is-loading").forEach(function (grid) {
      grid.classList.remove("is-loading");
    });
  }

  function upgradeWishlistButtons() {
    $$(".dest-card__bookmark").forEach(function (btn) {
      if (btn.getAttribute("data-heart")) return;
      btn.innerHTML = HEART_SVG;
      btn.setAttribute("data-heart", "1");
      var label = btn.getAttribute("aria-label") || "Save trip";
      if (label.indexOf("heart") === -1 && label.indexOf("wishlist") === -1) {
        btn.setAttribute("aria-label", "Add to wishlist");
      }
    });
  }

  function syncWishlistFromServer() {
    if (!window.WanderLuxApi || !WanderLuxApi.getToken()) {
      return Promise.resolve(getSavedDestinationIds());
    }
    return WanderLuxApi.getSavedSlugs()
      .then(function (slugs) {
        var local = getSavedDestinationIds();
        var map = {};
        (slugs || []).forEach(function (s) {
          map[s] = true;
        });
        local.forEach(function (s) {
          map[s] = true;
        });
        var merged = Object.keys(map);
        setSavedDestinationIds(merged);
        if (merged.length !== (slugs || []).length) {
          return WanderLuxApi.setSavedSlugs(merged).then(function () {
            return merged;
          });
        }
        return merged;
      })
      .catch(function () {
        return getSavedDestinationIds();
      });
  }

  function toggleWishlistSlug(id) {
    var saved = getSavedDestinationIds().slice();
    var i = saved.indexOf(id);
    if (i === -1) saved.push(id);
    else saved.splice(i, 1);
    setSavedDestinationIds(saved);
    syncBookmarkButtons();
    if (window.WanderLuxApi && WanderLuxApi.getToken()) {
      WanderLuxApi.setSavedSlugs(saved).catch(function () {
        /* keep local */
      });
    }
    return saved;
  }

  /* ——— Mobile nav ——— */
  function initNav() {
    var toggle = $(".nav-toggle");
    var navMain = $(".nav-main");
    if (!toggle || !navMain) return;

    toggle.addEventListener("click", function () {
      var open = navMain.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    $$(".nav-list a", navMain).forEach(function (link) {
      link.addEventListener("click", function () {
        navMain.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ——— Auth UI in header ——— */
  function ensureAdminNavLink() {
    $$(".nav-list").forEach(function (navList) {
      if ($(".nav-admin-item", navList)) return;
      var li = document.createElement("li");
      li.className = "nav-admin-item";
      li.hidden = true;
      var a = document.createElement("a");
      a.href = "admin.html";
      a.textContent = "Admin";
      li.appendChild(a);
      navList.appendChild(li);
    });
  }

  function updateAuthNav() {
    ensureAdminNavLink();
    var guest = $("#nav-guest");
    var user = $("#nav-user");
    var session = getSession();

    if (!guest || !user) return;

    if (session && session.fullName) {
      guest.hidden = true;
      user.hidden = false;
    } else {
      guest.hidden = false;
      user.hidden = true;
    }

    var logoutBtn = $("#btn-logout");
    if (logoutBtn) {
      logoutBtn.onclick = function () {
        if (window.WanderLuxApi) {
          WanderLuxApi.logout();
        }
        setSession(null);
        window.location.href = "index.html";
      };
    }
    var isAdmin = !!(session && String(session.role || "").toLowerCase() === "admin");
    $$(".nav-admin-item").forEach(function (item) {
      item.hidden = !isAdmin;
    });
  }

  function initLoginWelcome() {
    var notice = $("#login-welcome-notice");
    if (!notice) return;
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get("registered") === "1") {
        notice.removeAttribute("hidden");
      }
    } catch (e) {
      /* ignore */
    }
  }

  /* ——— Hero slider ——— */
  function initHeroSlider() {
    var slides = $$(".hero-slide");
    if (!slides.length) return;

    var dotsWrap = $(".slider-dots");
    var prev = $('.slider-btn[data-dir="prev"]');
    var next = $('.slider-btn[data-dir="next"]');
    var index = 0;
    var timer;

    function show(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (s, j) {
        s.classList.toggle("is-active", j === index);
      });
      $$(".slider-dot").forEach(function (d, j) {
        d.classList.toggle("is-active", j === index);
        d.setAttribute("aria-selected", j === index ? "true" : "false");
      });
    }

    if (dotsWrap) {
      slides.forEach(function (_, j) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "slider-dot" + (j === 0 ? " is-active" : "");
        b.setAttribute("aria-label", "Go to slide " + (j + 1));
        b.setAttribute("aria-selected", j === 0 ? "true" : "false");
        b.addEventListener("click", function () {
          show(j);
          resetTimer();
        });
        dotsWrap.appendChild(b);
      });
    }

    function nextSlide() {
      show(index + 1);
    }

    function resetTimer() {
      clearInterval(timer);
      timer = setInterval(nextSlide, 6000);
    }

    if (prev) prev.addEventListener("click", function () { show(index - 1); resetTimer(); });
    if (next) next.addEventListener("click", function () { show(index + 1); resetTimer(); });

    resetTimer();
  }

  function formatMoney(n) {
    return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
  }

  function getSavedDestinationIds() {
    try {
      var raw = localStorage.getItem(STORAGE_SAVED);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function setSavedDestinationIds(ids) {
    localStorage.setItem(STORAGE_SAVED, JSON.stringify(ids));
  }

  function setPendingBooking(id) {
    var info = getCatalog()[id];
    if (!info) return;
    var ref = "WLX-" + Date.now().toString(36).toUpperCase();
    localStorage.setItem(
      STORAGE_PENDING,
      JSON.stringify({ id: id, ref: ref, createdAt: new Date().toISOString() })
    );
  }

  function getPendingBooking() {
    try {
      var raw = localStorage.getItem(STORAGE_PENDING);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearPendingBooking() {
    localStorage.removeItem(STORAGE_PENDING);
  }

  function syncBookmarkButtons() {
    upgradeWishlistButtons();
    var saved = getSavedDestinationIds();
    $$(".dest-card").forEach(function (card) {
      var id = card.getAttribute("data-dest-id");
      var btn = $(".dest-card__bookmark", card);
      if (!btn || !id) return;
      var isOn = saved.indexOf(id) !== -1;
      btn.classList.toggle("is-saved", isOn);
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
      btn.setAttribute("aria-label", isOn ? "Remove from wishlist" : "Add to wishlist");
    });
  }

  function initDestinationBooking() {
    if (!document.querySelector(".dest-card")) return;

    hydrateCatalogMeta();
    injectCompareRow();
    injectDetailButtons();

    syncBookmarkButtons();

    $$(".dest-card__bookmark").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var card = btn.closest(".dest-card");
        if (!card) return;
        var id = card.getAttribute("data-dest-id");
        if (!id || !getCatalog()[id]) return;
        toggleWishlistSlug(id);
      });
    });

    syncWishlistFromServer().then(function () {
      syncBookmarkButtons();
    });

    $$(".js-book-dest").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".dest-card");
        if (!card) return;
        var id = card.getAttribute("data-dest-id");
        var trip = id ? getCatalog()[id] : null;
        if (!id || !trip) {
          showModal(
            "Trip data unavailable",
            "Reload the page. If it persists, seed destinations in MongoDB (npm run seed in the server folder) or check the API.",
            true
          );
          return;
        }
        clearCheckoutDraft();
        if (window.WanderLuxApi) {
          WanderLuxApi.startBooking(id)
            .then(function (res) {
              localStorage.setItem(
                STORAGE_PENDING,
                JSON.stringify({
                  id: id,
                  ref: res.ref,
                  createdAt: new Date().toISOString(),
                })
              );
              window.location.href = "checkout.html";
            })
            .catch(function () {
              setPendingBooking(id);
              window.location.href = "checkout.html";
            });
        } else {
          setPendingBooking(id);
          window.location.href = "checkout.html";
        }
      });
    });
  }

  function getCheckoutDraft() {
    try {
      var raw = sessionStorage.getItem(STORAGE_CHECKOUT_DRAFT);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setCheckoutDraft(obj) {
    sessionStorage.setItem(STORAGE_CHECKOUT_DRAFT, JSON.stringify(obj));
  }

  function syncCheckoutToApi(ref, draft) {
    if (!ref || !draft || !window.WanderLuxApi) {
      return Promise.resolve();
    }
    return WanderLuxApi.patchCheckout(ref, draft).catch(function () {
      /* offline — draft stays local only */
    });
  }

  /** Ensure pending booking exists on API (re-start if ref is local-only or destination was missing). */
  function ensureServerBooking(pending, draft) {
    if (!window.WanderLuxApi || !pending || !pending.id) {
      return Promise.resolve(pending);
    }
    function savePending(next) {
      localStorage.setItem(
        STORAGE_PENDING,
        JSON.stringify({
          id: next.id,
          ref: next.ref,
          createdAt: next.createdAt || new Date().toISOString(),
        })
      );
      return next;
    }
    function patchWithRef(ref) {
      if (!ref || !draft) return Promise.resolve();
      return WanderLuxApi.patchCheckout(ref, draft).catch(function () {
        /* keep local draft */
      });
    }
    function startFresh() {
      return WanderLuxApi.startBooking(pending.id)
        .then(function (res) {
          var next = savePending({
            id: pending.id,
            ref: res.ref,
            createdAt: new Date().toISOString(),
          });
          return patchWithRef(next.ref).then(function () {
            return next;
          });
        })
        .catch(function (err) {
          var msg =
            (err && err.message) ||
            "Could not start booking on the server.";
          if (err && err.status === 404) {
            msg +=
              " Destination may be missing in MongoDB — run npm run extract-catalog && npm run seed in the server folder.";
          }
          return Promise.reject(new Error(msg));
        });
    }
    if (!pending.ref) {
      return startFresh();
    }
    return WanderLuxApi.getBookingByRef(pending.ref)
      .then(function () {
        return patchWithRef(pending.ref).then(function () {
          return pending;
        });
      })
      .catch(function () {
        return startFresh();
      });
  }

  function clearCheckoutDraft() {
    sessionStorage.removeItem(STORAGE_CHECKOUT_DRAFT);
  }

  function announceLive(msg) {
    var el = $("#live-trip-announcement");
    if (!el) return;
    el.textContent = msg;
  }

  function hydrateCatalogMeta() {
    var cat = getCatalog();
    $$(".dest-card[data-dest-id]").forEach(function (card) {
      var id = card.getAttribute("data-dest-id");
      var c = cat[id];
      if (!c) return;
      card.setAttribute("data-region", c.region);
      card.setAttribute("data-budget", c.budgetTier);
      card.setAttribute("data-nights", String(c.nights));
      card.setAttribute("data-style", c.styles.join(","));
      card.setAttribute("data-rating", String(c.rating));
      card.setAttribute("data-popularity", String(c.popularity));
      card.setAttribute("data-price", String(c.price));
      card.setAttribute("data-search", (c.title + " " + c.desc).toLowerCase());
    });
  }

  function filterAndSortTripCards() {
    var grid = $("#trip-catalog-grid") || document;
    var cards = $$(".dest-card[data-dest-id]", grid);
    var searchEl = $("#trip-search");
    var regionEl = $("#filter-region");
    var budgetEl = $("#filter-budget");
    var styleEl = $("#filter-style");
    var nightsEl = $("#filter-nights");
    var sortEl = $("#sort-trips");

    var q = searchEl ? searchEl.value.trim().toLowerCase() : "";
    var region = regionEl ? regionEl.value : "";
    var budget = budgetEl ? budgetEl.value : "";
    var style = styleEl ? styleEl.value : "";
    var nightsMax = nightsEl ? parseInt(nightsEl.value, 10) : NaN;
    var sort = sortEl ? sortEl.value : "popularity-desc";

    var visible = 0;
    cards.forEach(function (card) {
      var match = true;
      var id = card.getAttribute("data-dest-id");
      var c = getCatalog()[id];
      var searchBlob = card.getAttribute("data-search") || "";
      if (q && searchBlob.indexOf(q) === -1) match = false;
      if (region && card.getAttribute("data-region") !== region) match = false;
      if (budget && card.getAttribute("data-budget") !== budget) match = false;
      if (style) {
        var st = card.getAttribute("data-style") || "";
        if (st.split(",").indexOf(style) === -1) match = false;
      }
      if (!isNaN(nightsMax) && nightsMax > 0) {
        var n = parseInt(card.getAttribute("data-nights"), 10);
        if (n > nightsMax) match = false;
      }
      card.hidden = !match;
      if (match) visible++;
    });

    var parent = $("#trip-catalog-grid");
    if (parent && sort !== "none") {
      var sorted = cards.slice().sort(function (a, b) {
        var pa = parseFloat(a.getAttribute("data-price")) || 0;
        var pb = parseFloat(b.getAttribute("data-price")) || 0;
        var ra = parseFloat(a.getAttribute("data-rating")) || 0;
        var rb = parseFloat(b.getAttribute("data-rating")) || 0;
        var pca = parseFloat(a.getAttribute("data-popularity")) || 0;
        var pcb = parseFloat(b.getAttribute("data-popularity")) || 0;
        if (sort === "price-asc") return pa - pb;
        if (sort === "price-desc") return pb - pa;
        if (sort === "rating-desc") return rb - ra;
        return pcb - pca;
      });
      sorted.forEach(function (c) {
        parent.appendChild(c);
      });
    }

    var countEl = $("#trip-results-count");
    if (countEl) countEl.textContent = String(visible);
    announceLive(visible + " trips match your filters.");
  }

  function initTripDiscovery() {
    if (!$("#trip-discovery")) return;
    hydrateCatalogMeta();
    var searchEl = $("#trip-search");
    var regionEl = $("#filter-region");
    var budgetEl = $("#filter-budget");
    var styleEl = $("#filter-style");
    var nightsEl = $("#filter-nights");
    var sortEl = $("#sort-trips");
    var resetBtn = $("#trip-filter-reset");

    [searchEl, regionEl, budgetEl, styleEl, nightsEl, sortEl].forEach(function (el) {
      if (!el) return;
      el.addEventListener("input", filterAndSortTripCards);
      el.addEventListener("change", filterAndSortTripCards);
    });
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (searchEl) searchEl.value = "";
        if (regionEl) regionEl.value = "";
        if (budgetEl) budgetEl.value = "";
        if (styleEl) styleEl.value = "";
        if (nightsEl) nightsEl.value = "";
        if (sortEl) sortEl.value = "popularity-desc";
        filterAndSortTripCards();
      });
    }
    try {
      var params = new URLSearchParams(window.location.search);
      var vibe = params.get("vibe");
      if (vibe && styleEl) styleEl.value = vibe;
    } catch (errV) {
      /* ignore */
    }
    filterAndSortTripCards();
  }

  function buildOsmEmbedUrl(lat, lng) {
    var d = 0.08;
    var minLon = lng - d;
    var minLat = lat - d;
    var maxLon = lng + d;
    var maxLat = lat + d;
    return (
      "https://www.openstreetmap.org/export/embed.html?bbox=" +
      minLon +
      "," +
      minLat +
      "," +
      maxLon +
      "," +
      maxLat +
      "&layer=mapnik&marker=" +
      lat +
      "," +
      lng
    );
  }

  function openTripDetailModal(destId) {
    var c = getCatalog()[destId];
    if (!c) {
      showModal(
        "Trip data unavailable",
        "Reload the page. If destinations are empty in MongoDB, run npm run seed from the server folder.",
        true
      );
      return;
    }
    var overlay = $("#trip-detail-overlay");
    if (!overlay) return;

    var title = $("#trip-detail-title");
    var body = $("#trip-detail-body");
    var mapf = $("#trip-detail-map");
    if (title) title.textContent = c.title;
    if (mapf) mapf.src = buildOsmEmbedUrl(c.lat, c.lng);

    if (body) {
      var inc = (c.included || [])
        .map(function (x) {
          return "<li>" + escapeHtml(x) + "</li>";
        })
        .join("");
      var exc = (c.notIncluded || [])
        .map(function (x) {
          return "<li>" + escapeHtml(x) + "</li>";
        })
        .join("");
      var faq = (c.faq || [])
        .map(function (f) {
          return "<dt>" + escapeHtml(f.q) + "</dt><dd>" + escapeHtml(f.a) + "</dd>";
        })
        .join("");
      body.innerHTML =
        "<p class=\"trip-detail-lead\">" +
        escapeHtml(c.desc) +
        "</p>" +
        "<div class=\"trip-detail-chips\">" +
        "<span class=\"dest-card__tag\">" +
        escapeHtml(c.timezone) +
        "</span>" +
        "<span class=\"dest-card__tag\">Best: " +
        escapeHtml(c.bestSeason) +
        "</span>" +
        "</div>" +
        "<h4>What's included</h4><ul class=\"trip-detail-list\">" +
        inc +
        "</ul>" +
        "<h4>Not included</h4><ul class=\"trip-detail-list trip-detail-list--muted\">" +
        exc +
        "</ul>" +
        "<h4>FAQ</h4><dl class=\"trip-detail-faq\">" +
        faq +
        "</dl>" +
        "<div id=\"trip-detail-reviews\" class=\"trip-reviews-block\"><p class=\"trip-reviews-summary\">Loading reviews…</p></div>";
    }

    if (window.WanderLuxApi && typeof WanderLuxApi.getDestinationReviews === "function") {
      WanderLuxApi.getDestinationReviews(destId)
        .then(function (data) {
          var block = $("#trip-detail-reviews");
          if (!block) return;
          var summary = data.summary || { averageRating: 0, count: 0 };
          var reviews = data.reviews || [];
          if (!summary.count) {
            block.innerHTML = "<p class=\"trip-reviews-summary\">No traveller reviews yet for this package.</p>";
            return;
          }
          var head =
            "<p class=\"trip-reviews-summary\">" +
            starsHtml(summary.averageRating) +
            " " +
            summary.averageRating.toFixed(1) +
            " · " +
            summary.count +
            " review" +
            (summary.count === 1 ? "" : "s") +
            "</p>";
          block.innerHTML =
            head +
            reviews
              .slice(0, 5)
              .map(function (r) {
                return (
                  "<article class=\"trip-review-item\">" +
                  "<p class=\"trip-review-item__meta\"><span class=\"trip-review-item__stars\">" +
                  starsHtml(r.rating) +
                  "</span> · " +
                  escapeHtml(r.authorName) +
                  " · " +
                  new Date(r.createdAt).toLocaleDateString("en-AU") +
                  "</p>" +
                  (r.title ? "<strong>" + escapeHtml(r.title) + "</strong><br>" : "") +
                  escapeHtml(r.body || "") +
                  "</article>"
                );
              })
              .join("");
        })
        .catch(function () {
          var block = $("#trip-detail-reviews");
          if (block) block.innerHTML = "<p class=\"trip-reviews-summary\">Reviews unavailable right now.</p>";
        });
    }

    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    var closeBtn = $("#trip-detail-close");
    if (closeBtn) closeBtn.focus();

    function close() {
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
    }
    overlay.onclick = function (e) {
      if (e.target === overlay) close();
    };
    if (closeBtn) closeBtn.onclick = close;
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function ensureTripDetailOverlay() {
    if ($("#trip-detail-overlay")) return;
    var wrap = document.createElement("div");
    wrap.id = "trip-detail-overlay";
    wrap.className = "modal-overlay trip-detail-overlay";
    wrap.setAttribute("aria-hidden", "true");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "trip-detail-title");
    wrap.innerHTML =
      "<div class=\"modal modal--wide trip-detail-modal\">" +
      "<button type=\"button\" class=\"trip-detail-close\" id=\"trip-detail-close\" aria-label=\"Close details\">&times;</button>" +
      "<h3 id=\"trip-detail-title\"></h3>" +
      "<div class=\"trip-detail-split\">" +
      "<div class=\"trip-detail-map-wrap\"><iframe id=\"trip-detail-map\" title=\"Map\" loading=\"lazy\" referrerpolicy=\"no-referrer-when-downgrade\"></iframe></div>" +
      "<div id=\"trip-detail-body\" class=\"trip-detail-body\"></div></div></div>";
    document.body.appendChild(wrap);
  }

  function initTripDetailButtons() {
    ensureTripDetailOverlay();
    $$(".js-trip-detail").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".dest-card");
        var id = card ? card.getAttribute("data-dest-id") : btn.getAttribute("data-detail-id");
        if (id) openTripDetailModal(id);
      });
    });
  }

  function initCompareTray() {
    var bar = $("#compare-tray");
    if (!bar) return;

    function updateTray() {
      var checked = $$('.dest-card__compare input[type="checkbox"]:checked');
      var ids = checked.map(function (cb) {
        return cb.value;
      });
      bar.hidden = ids.length < 2;
      var names = $("#compare-tray-names");
      if (names) {
        names.textContent = ids
          .map(function (id) {
            var c = getCatalog()[id];
            return c ? c.title : id;
          })
          .join(" vs ");
      }
      $("#compare-open").disabled = ids.length < 2 || ids.length > 3;
    }

    $$('.dest-card__compare input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener("change", updateTray);
    });

    var openBtn = $("#compare-open");
    if (openBtn) {
      openBtn.addEventListener("click", function () {
        var ids = $$('.dest-card__compare input[type="checkbox"]:checked').map(function (c) {
          return c.value;
        });
        if (ids.length < 2) return;
        var overlay = $("#compare-modal-overlay");
        var inner = $("#compare-modal-inner");
        if (!overlay || !inner) return;
        var rows = ["Price", "Nights", "Region", "Style", "Rating", "Best season", "Timezone"];
        var cat = getCatalog();
        var header =
          "<thead><tr><th>Detail</th>" +
          ids
            .map(function (id) {
              return "<th>" + escapeHtml(cat[id] ? cat[id].title : id) + "</th>";
            })
            .join("") +
          "</tr></thead>";
        var bodyRows = rows
          .map(function (label, ri) {
            var cells = ids
              .map(function (id) {
                var c = cat[id];
                if (!c) return "<td>—</td>";
                if (ri === 0) return "<td>" + formatMoney(c.price) + "</td>";
                if (ri === 1) return "<td>" + c.nights + " nights</td>";
                if (ri === 2) return "<td>" + c.region + "</td>";
                if (ri === 3) return "<td>" + c.styles.join(", ") + "</td>";
                if (ri === 4) return "<td>" + c.rating + "</td>";
                if (ri === 5) return "<td>" + escapeHtml(c.bestSeason) + "</td>";
                return "<td>" + escapeHtml(c.timezone) + "</td>";
              })
              .join("");
            return "<tr><th scope=\"row\">" + label + "</th>" + cells + "</tr>";
          })
            .join("");
        inner.innerHTML = "<table class=\"compare-table\">" + header + "<tbody>" + bodyRows + "</tbody></table>";
        overlay.classList.add("is-open");
        overlay.setAttribute("aria-hidden", "false");
      });
    }

    var closeCm = $("#compare-modal-close");
    var cm = $("#compare-modal-overlay");
    if (closeCm && cm) {
      closeCm.addEventListener("click", function () {
        cm.classList.remove("is-open");
        cm.setAttribute("aria-hidden", "true");
      });
      cm.addEventListener("click", function (e) {
        if (e.target === cm) {
          cm.classList.remove("is-open");
          cm.setAttribute("aria-hidden", "true");
        }
      });
    }
  }

  function injectCompareRow() {
    if (!$("#compare-tray")) return;
    $$(".dest-card[data-dest-id]").forEach(function (card) {
      if ($(".dest-card__compare", card)) return;
      var id = card.getAttribute("data-dest-id");
      var row = document.createElement("label");
      row.className = "dest-card__compare";
      row.innerHTML =
        "<input type=\"checkbox\" name=\"compare\" value=\"" +
        id +
        "\"> <span>Compare</span>";
      var body = $(".dest-card__body", card);
      var cta = $(".js-book-dest", card);
      if (body && cta) body.insertBefore(row, cta);
    });
  }

  function injectDetailButtons() {
    $$(".dest-card[data-dest-id]").forEach(function (card) {
      if ($(".js-trip-detail", card)) return;
      var id = card.getAttribute("data-dest-id");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--ghost btn-block js-trip-detail";
      btn.textContent = "Details & map";
      var cta = $(".js-book-dest", card);
      if (cta && cta.parentNode) cta.parentNode.insertBefore(btn, cta);
    });
  }

  function initCheckoutWizard() {
    var root = $("#checkout-wizard");
    if (!root) return;

    function runWizard(pending) {
    if (!pending || !getCatalog()[pending.id]) {
      window.location.href = "booking.html";
      return;
    }

    var steps = $$(".checkout-step");
    var info = getCatalog()[pending.id];
    var titleEl = $("#checkout-trip-title");
    if (titleEl) titleEl.textContent = info.title;

    var draft = getCheckoutDraft() || {};
    var stepIndex = 0;

    function showStep(i) {
      stepIndex = i;
      steps.forEach(function (s, j) {
        s.hidden = j !== i;
        s.setAttribute("aria-hidden", j !== i ? "true" : "false");
      });
      $$(".checkout-progress__step").forEach(function (dot, j) {
        dot.classList.toggle("is-done", j < i);
        dot.classList.toggle("is-active", j === i);
      });
      var sticky = $("#checkout-sticky-summary");
      if (sticky) syncStickySummary(sticky, info, draft);
      if (i === 3) renderReview();
    }

    function syncStickySummary(el, trip, d) {
      var optFees = (d.insurance ? 120 : 0) + (d.transfer ? 90 : 0);
      var total = trip.price + optFees;
      var dep = Math.round(total * (trip.depositPercent || 0.2));
      el.innerHTML =
        '<p class="checkout-summary__eyebrow">Summary</p>' +
        '<p class="checkout-summary__title">' +
        escapeHtml(trip.title) +
        "</p>" +
        '<dl class="checkout-summary__dl">' +
        "<div><dt>Package</dt><dd>" +
        formatMoney(trip.price) +
        "</dd></div>" +
        (optFees
          ? "<div><dt>Options</dt><dd>" + formatMoney(optFees) + "</dd></div>"
          : "") +
        "<div><dt>Estimated total</dt><dd>" +
        formatMoney(total) +
        "</dd></div>" +
        '</dl><div class="checkout-summary__deposit-box"><span class="checkout-summary__deposit-label">Deposit due today (est.)</span><span class="checkout-summary__deposit-val">' +
        formatMoney(dep) +
        "</span></div>";
    }

    var formStart = $("#checkout-start");
    if (formStart) {
      if (draft.start) formStart.travelStart.value = draft.start;
      if (draft.end) formStart.travelEnd.value = draft.end;
      formStart.addEventListener("submit", function (e) {
        e.preventDefault();
        draft.start = formStart.travelStart.value;
        draft.end = formStart.travelEnd.value;
        setCheckoutDraft(draft);
        syncCheckoutToApi(pending && pending.ref, draft);
        showStep(1);
      });
    }

    var formWho = $("#checkout-who");
    if (formWho) {
      if (draft.adults) formWho.adults.value = draft.adults;
      if (draft.children) formWho.children.value = draft.children;
      formWho.addEventListener("submit", function (e) {
        e.preventDefault();
        draft.adults = parseInt(formWho.adults.value, 10) || 2;
        draft.children = parseInt(formWho.children.value, 10) || 0;
        setCheckoutDraft(draft);
        syncCheckoutToApi(pending && pending.ref, draft);
        showStep(2);
      });
    }

    var formOpt = $("#checkout-options");
    if (formOpt) {
      if (draft.insurance) formOpt.insurance.checked = true;
      if (draft.transfer) formOpt.transfer.checked = true;
    }

    var reviewEl = $("#checkout-review");
    function renderReview() {
      if (!reviewEl) return;
      var optFees = (draft.insurance ? 120 : 0) + (draft.transfer ? 90 : 0);
      reviewEl.innerHTML =
        "<ul class=\"checkout-review-list\">" +
        "<li><strong>Dates</strong> " +
        escapeHtml(draft.start || "—") +
        " → " +
        escapeHtml(draft.end || "—") +
        "</li>" +
        "<li><strong>Travellers</strong> " +
        (draft.adults || 2) +
        " adults" +
        (draft.children ? ", " + draft.children + " children" : "") +
        "</li>" +
        "<li><strong>Options</strong> " +
        (draft.insurance ? "Travel insurance" : "No insurance") +
        ", " +
        (draft.transfer ? "Airport transfer" : "No transfer") +
        "</li>" +
        "<li><strong>Options total</strong> " +
        formatMoney(optFees) +
        "</li>" +
        "</ul>";
    }

    if (formOpt) {
      formOpt.addEventListener("submit", function (e) {
        e.preventDefault();
        draft.insurance = formOpt.insurance.checked;
        draft.transfer = formOpt.transfer.checked;
        setCheckoutDraft(draft);
        syncCheckoutToApi(pending && pending.ref, draft);
        renderReview();
        showStep(3);
      });
    }

    var btnPay = $("#checkout-go-payment");
    if (btnPay) {
      btnPay.addEventListener("click", function () {
        setCheckoutDraft(draft);
        var ref = pending && pending.ref;
        var done = function () {
          window.location.href = "payment.html";
        };
        if (ref && window.WanderLuxApi) {
          WanderLuxApi.patchCheckout(ref, draft).then(done).catch(done);
        } else {
          done();
        }
      });
    }

    showStep(0);

    $$("[data-goto-step]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showStep(parseInt(btn.getAttribute("data-goto-step"), 10));
      });
    });

    var today = new Date();
    var iso = today.toISOString().slice(0, 10);
    var startIn = $("#travelStart");
    var endIn = $("#travelEnd");
    if (startIn) startIn.min = iso;
    if (endIn) endIn.min = iso;
    if (startIn && endIn) {
      startIn.addEventListener("change", function () {
        endIn.min = startIn.value || iso;
      });
    }
    }

    var pending = getPendingBooking();
    var params = new URLSearchParams(window.location.search);
    var destParam = params.get("dest");
    if (!pending && destParam && getCatalog()[destParam]) {
      if (window.WanderLuxApi) {
        WanderLuxApi.startBooking(destParam)
          .then(function (res) {
            localStorage.setItem(
              STORAGE_PENDING,
              JSON.stringify({
                id: destParam,
                ref: res.ref,
                createdAt: new Date().toISOString(),
              })
            );
            runWizard(getPendingBooking());
          })
          .catch(function () {
            setPendingBooking(destParam);
            runWizard(getPendingBooking());
          });
        return;
      }
      setPendingBooking(destParam);
      pending = getPendingBooking();
    }
    runWizard(pending);
  }

  function initConfirmationPage() {
    var refEl = $("#confirmation-ref");
    var detailEl = $("#confirmation-detail");
    if (!refEl || !detailEl) return;
    var params = new URLSearchParams(window.location.search);
    var ref = params.get("ref");
    if (!ref) {
      detailEl.innerHTML = "<p>No reference supplied. <a href=\"booking.html\">Browse trips</a></p>";
      return;
    }
    refEl.textContent = ref;

    function renderConfirm(rec) {
      var calLink =
        "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" +
        encodeURIComponent("WanderLux — " + rec.title) +
        "&details=" +
        encodeURIComponent("Ref " + rec.ref + ". Deposit paid.");
      detailEl.innerHTML =
        "<p>Confirmation sent to <strong>" +
        escapeHtml(rec.receiptEmail || "") +
        "</strong>.</p>" +
        "<p><a class=\"btn btn--secondary\" href=\"" +
        calLink +
        "\" target=\"_blank\" rel=\"noopener\">Add reminder to Google Calendar</a></p>" +
        "<p><a href=\"policies.html#itinerary\" class=\"btn btn--outline\">Document delivery policy</a></p>";
    }

    if (window.WanderLuxApi) {
      WanderLuxApi.getBookingByRef(ref)
        .then(function (data) {
          var b = data.booking;
          var dest = data.destination;
          if (!b || b.status !== "paid") {
            throw new Error("not paid");
          }
          renderConfirm({
            ref: b.ref,
            title: dest && dest.title ? dest.title : b.destinationSlug,
            receiptEmail: b.receiptEmail || "",
          });
        })
        .catch(function () {
          var history = [];
          try {
            history = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
          } catch (e) {
            history = [];
          }
          var rec = history.filter(function (h) {
            return h.ref === ref;
          })[0];
          if (!rec) {
            detailEl.innerHTML =
              "<p>We could not find that booking reference. Make sure the API is running and you completed payment.</p>";
            return;
          }
          renderConfirm(rec);
        });
      return;
    }

    var history = [];
    try {
      history = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
    } catch (e) {
      history = [];
    }
    var rec = history.filter(function (h) {
      return h.ref === ref;
    })[0];
    if (!rec) {
      detailEl.innerHTML = "<p>We could not find that booking reference in this browser.</p>";
      return;
    }
    renderConfirm(rec);
  }

  function initMyTripsPage() {
    var list = $("#my-trips-list");
    var savedList = $("#my-saved-list");
    var reviewsSection = $("#my-reviews-section");
    var reviewsList = $("#my-reviews-list");
    var reviewSelect = $("#review-booking-ref");
    var reviewForm = $("#review-submit-form");
    if (!list) return;

    function fillLists(history, savedIds) {
      if (!history.length) {
        list.innerHTML = "<li>No completed deposits yet.</li>";
      } else {
        list.innerHTML = history
          .map(function (h) {
            return (
              "<li><strong>" +
              escapeHtml(h.title) +
              "</strong> — " +
              escapeHtml(h.ref) +
              " · " +
              formatMoney(h.deposit) +
              " · " +
              new Date(h.paidAt).toLocaleDateString("en-AU") +
              "</li>"
            );
          })
          .join("");
      }

      if (savedList) {
        if (!savedIds.length) {
          savedList.innerHTML = "<li>No saved trips yet — tap hearts on package cards.</li>";
        } else {
          savedList.innerHTML = savedIds
            .map(function (id) {
              var c = getCatalog()[id];
              return (
                "<li>" +
                (c ? escapeHtml(c.title) : escapeHtml(id)) +
                ' <a href="booking.html">View</a></li>'
              );
            })
            .join("");
        }
      }

      if (reviewSelect && history.length) {
        reviewSelect.innerHTML =
          '<option value="">Select a paid booking…</option>' +
          history
            .map(function (h) {
              return (
                '<option value="' +
                escapeHtml(h.ref) +
                '">' +
                escapeHtml(h.title) +
                " (" +
                escapeHtml(h.ref) +
                ")</option>"
              );
            })
            .join("");
      }
    }

    function renderMyReviews(reviews) {
      if (!reviewsList) return;
      if (!reviews.length) {
        reviewsList.innerHTML = "<li>You have not submitted any reviews yet.</li>";
        return;
      }
      reviewsList.innerHTML = reviews
        .map(function (r) {
          var pillClass = "review-status-pill";
          if (r.status === "approved") pillClass += " review-status-pill--approved";
          if (r.status === "rejected") pillClass += " review-status-pill--rejected";
          return (
            "<li><span class=\"" +
            pillClass +
            "\">" +
            escapeHtml(r.status) +
            "</span> · " +
            starsHtml(r.rating) +
            " <strong>" +
            escapeHtml(r.title || r.destinationSlug) +
            "</strong> — " +
            escapeHtml(r.bookingRef) +
            "<br>" +
            escapeHtml(r.body || "") +
            "</li>"
          );
        })
        .join("");
    }

    function initReviewForm() {
      if (!reviewForm || !window.WanderLuxApi || !WanderLuxApi.getToken()) return;
      reviewForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var ref = reviewSelect ? reviewSelect.value : "";
        var rating = parseInt($("#review-rating").value, 10);
        var title = $("#review-title").value.trim();
        var body = $("#review-body").value.trim();
        var msg = $("#review-form-msg");
        if (!ref) {
          if (msg) msg.textContent = "Choose a booking reference.";
          return;
        }
        if (!body) {
          if (msg) msg.textContent = "Please write your review.";
          return;
        }
        WanderLuxApi.submitReview(ref, rating, title, body)
          .then(function () {
            if (msg) msg.textContent = "Thanks! Your review is pending moderation.";
            reviewForm.reset();
            return WanderLuxApi.getMyReviews();
          })
          .then(function (revs) {
            renderMyReviews(revs || []);
          })
          .catch(function (err) {
            if (msg) msg.textContent = (err && err.message) || "Could not submit review.";
          });
      });
    }

    if (window.WanderLuxApi && WanderLuxApi.getToken()) {
      if (reviewsSection) reviewsSection.hidden = false;
      Promise.all([
        WanderLuxApi.myPaidBookings(),
        WanderLuxApi.getSavedSlugs(),
        WanderLuxApi.getMyReviews(),
      ])
        .then(function (triple) {
          var bookings = triple[0] || [];
          var slugs = triple[1] || [];
          var myReviews = triple[2] || [];
          var history = bookings.map(function (b) {
            return {
              title: b.title,
              ref: b.ref,
              deposit: b.deposit,
              paidAt: b.paidAt,
            };
          });
          if (slugs.length) setSavedDestinationIds(slugs);
          fillLists(history, slugs.length ? slugs : getSavedDestinationIds());
          renderMyReviews(myReviews);
          initReviewForm();
        })
        .catch(function () {
          fillLists([], getSavedDestinationIds());
          if (reviewsList) reviewsList.innerHTML = "<li>Could not load reviews.</li>";
        });
      return;
    }

    if (reviewsSection) reviewsSection.hidden = true;
    var history = [];
    try {
      history = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
    } catch (e) {
      history = [];
    }
    fillLists(history, getSavedDestinationIds());
  }

  function initVibeQuiz() {
    var root = $("#vibe-quiz");
    if (!root) return;
    $$(".vibe-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var vibe = btn.getAttribute("data-vibe");
        var map = {
          beach: "maldives",
          city: "tokyo",
          adventure: "swiss",
          culture: "kyoto",
          romantic: "santorini",
        };
        var id = map[vibe] || "booking.html";
        announceLive("Suggestion: opening trips for " + vibe + " style.");
        if (getCatalog()[id]) {
          window.location.href = "booking.html?vibe=" + encodeURIComponent(vibe);
        }
      });
    });
  }

  function initStripeConfigHint() {
    var zone = $("#stripe-zone");
    if (!zone) return;
    /* global WANDERLUX_STRIPE_PK */
    if (typeof window.WANDERLUX_STRIPE_PK === "string" && window.WANDERLUX_STRIPE_PK.indexOf("pk_") === 0) {
      zone.hidden = false;
      zone.innerHTML =
        "<strong>Stripe key detected.</strong> Mount Payment Element here using Stripe.js — see policies.";
    }
  }

  function initRecentTicker() {
    var el = $("#recent-bookings-ticker");
    if (!el) return;
    var samples = [
      "Alex · Maldives · booked 2h ago",
      "Sam & Jo · Swiss Alps · yesterday",
      "Priya · Kyoto · this week",
      "Marcus · NYC · 3 days ago",
    ];
    var i = 0;
    function tick() {
      el.textContent = samples[i % samples.length];
      i++;
    }
    tick();
    setInterval(tick, 5200);
  }

  function optionFeesFromDraft(d) {
    if (!d) return 0;
    return (d.insurance ? 120 : 0) + (d.transfer ? 90 : 0);
  }

  function initPaymentPage() {
    var emptyEl = $("#payment-summary-empty");
    var detailEl = $("#payment-summary-detail");
    var form = $("#payment-form");
    if (!emptyEl || !detailEl || !form) return;

    var draft = getCheckoutDraft() || {};
    var pending = getPendingBooking();

    if (pending && pending.id && getCatalog()[pending.id]) {
      var info = getCatalog()[pending.id];
      var optFees = optionFeesFromDraft(draft);
      var total = info.price + optFees;
      var deposit = Math.round(total * (info.depositPercent || 0.2));
      emptyEl.hidden = true;
      detailEl.hidden = false;
      var img = $("#payment-summary-img");
      if (img) {
        img.src = info.image;
        img.alt = info.imageAlt || "";
      }
      var title = $("#payment-summary-title");
      if (title) title.textContent = info.title;
      var desc = $("#payment-summary-desc");
      if (desc) desc.textContent = info.desc;
      var ref = $("#payment-summary-ref");
      if (ref) ref.textContent = pending.ref || "—";

      if (window.WanderLuxApi) {
        ensureServerBooking(pending, draft)
          .then(function (synced) {
            if (synced && synced.ref) {
              pending = synced;
              if (ref) ref.textContent = synced.ref;
            }
          })
          .catch(function () {
            /* payment submit will surface a clearer error */
          });
      }

      var extras = $("#payment-summary-extras");
      if (extras) {
        var hasPlanner =
          !!(draft.start || draft.end || draft.adults || draft.children || optFees);
        if (hasPlanner) {
          extras.hidden = false;
          var parts = [];
          parts.push(
            "<li><strong>Dates</strong> " +
              escapeHtml(draft.start || "TBC") +
              " → " +
              escapeHtml(draft.end || "TBC") +
              "</li>"
          );
          parts.push(
            "<li><strong>Travellers</strong> " +
              (draft.adults || 2) +
              " adults" +
              (draft.children ? ", " + draft.children + " children" : "") +
              "</li>"
          );
          var optBits = [];
          if (draft.insurance) optBits.push("insurance");
          if (draft.transfer) optBits.push("transfer");
          parts.push(
            "<li><strong>Add-ons</strong> " +
              (optBits.length ? optBits.join(", ") + " · " : "") +
              formatMoney(optFees) +
              "</li>"
          );
          extras.innerHTML = parts.join("");
        } else {
          extras.hidden = true;
          extras.innerHTML = "";
        }
      }

      var price = $("#payment-summary-price");
      if (price) price.textContent = formatMoney(total);

      var dep = $("#payment-summary-deposit");
      if (dep) dep.textContent = formatMoney(deposit);
      var depNote = $("#payment-deposit-note");
      if (depNote) {
        depNote.textContent =
          "Deposit is " + Math.round((info.depositPercent || 0.2) * 100) + "% of package plus selected options (demo calculation).";
      }
    } else {
      emptyEl.hidden = false;
      detailEl.hidden = true;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearFieldErrors(form);

      var pendingNow = getPendingBooking();
      if (!pendingNow || !pendingNow.id || !getCatalog()[pendingNow.id]) {
        showModal("No trip selected", "Complete a trip on Book a trip first.", true);
        return;
      }

      var name = form.cardName.value.trim();
      var email = form.billingEmail.value.trim();
      var ok = true;

      if (!name) {
        setFieldError(form, "cardName", true);
        ok = false;
      }
      if (!email || !isValidEmail(email)) {
        setFieldError(form, "billingEmail", true);
        ok = false;
      }

      if (!ok) {
        showModal("Check payment fields", "Correct the highlighted fields and try again.", true);
        return;
      }

      var info = getCatalog()[pendingNow.id];
      var d = getCheckoutDraft() || {};
      var optFees = optionFeesFromDraft(d);
      var total = info.price + optFees;
      var deposit = Math.round(total * (info.depositPercent || 0.2));
      var submitBtn = $("#payment-submit");

      function pushLocalHistory() {
        var history = [];
        try {
          var hr = localStorage.getItem(STORAGE_BOOKINGS);
          history = hr ? JSON.parse(hr) : [];
          if (!Array.isArray(history)) history = [];
        } catch (err) {
          history = [];
        }
        history.push({
          ref: pendingNow.ref,
          destinationId: pendingNow.id,
          title: info.title,
          deposit: deposit,
          packagePrice: info.price,
          optionsFees: optFees,
          paidAt: new Date().toISOString(),
          receiptEmail: email,
          checkout: d,
        });
        localStorage.setItem(STORAGE_BOOKINGS, JSON.stringify(history));
      }

      if (window.WanderLuxApi && typeof window.Razorpay === "function") {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Preparing Razorpay...";
        }
        ensureServerBooking(pendingNow, d)
          .then(function (synced) {
            if (synced && synced.ref) {
              pendingNow = synced;
              var refEl = $("#payment-summary-ref");
              if (refEl) refEl.textContent = synced.ref;
            }
            if (!pendingNow.ref) {
              return Promise.reject(new Error("Booking reference missing. Return to checkout and try again."));
            }
            return WanderLuxApi.createRazorpayOrder(pendingNow.ref);
          })
          .then(function (orderData) {
            var rz = new window.Razorpay({
              key: orderData.keyId,
              amount: orderData.amount,
              currency: orderData.currency,
              name: "TourMatrix Travel Agency",
              description: "Trip booking deposit",
              order_id: orderData.orderId,
              prefill: {
                name: name,
                email: email,
              },
              notes: {
                bookingRef: pendingNow.ref,
              },
              theme: {
                color: "#4d3a8a",
              },
              handler: function (resp) {
                WanderLuxApi.payBooking(pendingNow.ref, {
                  receiptEmail: email,
                  razorpayOrderId: resp.razorpay_order_id,
                  razorpayPaymentId: resp.razorpay_payment_id,
                  razorpaySignature: resp.razorpay_signature,
                })
                  .then(function () {
                    pushLocalHistory();
                    clearPendingBooking();
                    clearCheckoutDraft();
                    form.reset();
                    emptyEl.hidden = false;
                    detailEl.hidden = true;
                    window.location.href =
                      "confirmation.html?ref=" + encodeURIComponent(pendingNow.ref);
                  })
                  .catch(function (err) {
                    showModal(
                      "Payment verification failed",
                      (err && err.message) || "Your payment could not be verified. Contact support if money was debited.",
                      true
                    );
                  })
                  .finally(function () {
                    if (submitBtn) {
                      submitBtn.disabled = false;
                      submitBtn.textContent = "Pay with Razorpay";
                    }
                  });
              },
              modal: {
                ondismiss: function () {
                  if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Pay with Razorpay";
                  }
                },
              },
            });
            rz.open();
          })
          .catch(function (err) {
            showModal(
              "Payment could not start",
              (err && err.message) ||
                "Check that the API server is running and try again.",
              true
            );
          })
          .finally(function () {
            if (submitBtn && !submitBtn.disabled) {
              submitBtn.textContent = "Pay with Razorpay";
            }
          });
        return;
      }

      showModal(
        "Razorpay unavailable",
        typeof window.Razorpay !== "function"
          ? "Razorpay checkout.js did not load. Check your internet connection, refresh, and try again."
          : "Start the API server (npm run dev in the server folder) and try again.",
        true
      );
    });
  }

  /* ——— Modal ——— */
  function showModal(title, message, isError) {
    var overlay = $("#modal-overlay");
    if (!overlay) return;

    var h = $("#modal-title");
    var p = $("#modal-message");
    var inner = $(".modal", overlay);
    if (h) h.textContent = title;
    if (p) p.textContent = message;
    if (inner) {
      inner.classList.toggle("modal--error", !!isError);
    }
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");

    var close = function () {
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
    };

    var btn = $("#modal-close");
    if (btn) {
      btn.onclick = close;
    }
    overlay.onclick = function (e) {
      if (e.target === overlay) close();
    };
  }

  /* ——— Validation helpers ——— */
  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function isValidPhone(v) {
    var digits = v.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  }

  function clearFieldErrors(form) {
    $$(".form-group", form).forEach(function (g) {
      g.classList.remove("has-error");
    });
  }

  function setFieldError(form, name, show) {
    var group = form.querySelector('[data-field="' + name + '"]');
    if (group) group.classList.toggle("has-error", show);
  }

  function initAppointmentDateMin() {
    var input = $("#preferredDate");
    if (!input) return;
    var today = new Date();
    var y = today.getFullYear();
    var m = String(today.getMonth() + 1);
    if (m.length < 2) m = "0" + m;
    var d = String(today.getDate());
    if (d.length < 2) d = "0" + d;
    input.min = y + "-" + m + "-" + d;
  }

  /* ——— Appointment form ——— */
  function initAppointmentForm() {
    var form = $("#appointment-form");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearFieldErrors(form);

      var name = form.fullName.value.trim();
      var email = form.email.value.trim();
      var phone = form.phone.value.trim();
      var date = form.preferredDate.value;
      var message = form.message.value.trim();
      var ok = true;

      if (!name) {
        setFieldError(form, "fullName", true);
        ok = false;
      }
      if (!email || !isValidEmail(email)) {
        setFieldError(form, "email", true);
        ok = false;
      }
      if (!phone || !isValidPhone(phone)) {
        setFieldError(form, "phone", true);
        ok = false;
      }
      if (!date) {
        setFieldError(form, "preferredDate", true);
        ok = false;
      } else {
        var selected = new Date(date + "T12:00:00");
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selected < today) {
          setFieldError(form, "preferredDate", true);
          ok = false;
        }
      }
      if (!message) {
        setFieldError(form, "message", true);
        ok = false;
      }

      if (!ok) {
        showModal(
          "Please check the form",
          "Some fields are empty or invalid. Correct them and try again.",
          true
        );
        return;
      }

      if (window.WanderLuxApi) {
        WanderLuxApi.sendAppointment(name, email, phone, date, message)
          .then(function () {
            showModal(
              "Request received",
              "We saved your appointment request. A consultant will confirm by email.",
              false
            );
            form.reset();
          })
          .catch(function (err) {
            showModal(
              "Could not send",
              (err && err.message) || "Try again or email appointments@wanderluxtravel.com.",
              true
            );
          });
        return;
      }

      var subject = encodeURIComponent("WanderLux Appointment Request — " + name);
      var body = encodeURIComponent(
        "Name: " +
          name +
          "\nEmail: " +
          email +
          "\nPhone: " +
          phone +
          "\nPreferred date: " +
          date +
          "\n\nMessage:\n" +
          message
      );
      window.location.href = "mailto:appointments@wanderluxtravel.com?subject=" + subject + "&body=" + body;

      showModal(
        "Request ready",
        "Your details are valid. If your email program did not open, copy your message and email appointments@wanderluxtravel.com.",
        false
      );
      form.reset();
    });
  }

  /* ——— Contact form ——— */
  function initContactForm() {
    var form = $("#contact-form");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearFieldErrors(form);

      var name = form.contactName.value.trim();
      var email = form.contactEmail.value.trim();
      var topic = form.contactTopic.value;
      var message = form.contactMessage.value.trim();
      var ok = true;

      if (!name) {
        setFieldError(form, "contactName", true);
        ok = false;
      }
      if (!email || !isValidEmail(email)) {
        setFieldError(form, "contactEmail", true);
        ok = false;
      }
      if (!topic) {
        setFieldError(form, "contactTopic", true);
        ok = false;
      }
      if (!message || message.length < 10) {
        setFieldError(form, "contactMessage", true);
        ok = false;
      }

      if (!ok) {
        showModal("Please check the form", "Fill in all fields with a valid email and a message of at least 10 characters.", true);
        return;
      }

      if (window.WanderLuxApi) {
        WanderLuxApi.sendContact(name, email, topic, message)
          .then(function () {
            showModal(
              "Message sent",
              "Thank you — your enquiry is saved and our team will reply soon.",
              false
            );
            form.reset();
          })
          .catch(function (err) {
            showModal(
              "Could not send",
              (err && err.message) || "Try again or email info@wanderluxtravel.com.",
              true
            );
          });
        return;
      }

      var subject = encodeURIComponent("WanderLux Contact — " + topic + " — " + name);
      var body = encodeURIComponent(
        "From: " + name + "\nEmail: " + email + "\nTopic: " + topic + "\n\n" + message
      );
      window.location.href = "mailto:info@wanderluxtravel.com?subject=" + subject + "&body=" + body;

      showModal(
        "Message prepared",
        "If your mail client opened, send the email to complete your enquiry. Otherwise email info@wanderluxtravel.com directly.",
        false
      );
      form.reset();
    });
  }

  /* ——— Register ——— */
  function initRegisterForm() {
    var form = $("#register-form");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearFieldErrors(form);

      var fullName = form.regFullName.value.trim();
      var email = form.regEmail.value.trim().toLowerCase();
      var password = form.regPassword.value;
      var confirm = form.regPasswordConfirm.value;
      var ok = true;

      if (!fullName) {
        setFieldError(form, "regFullName", true);
        ok = false;
      }
      if (!email || !isValidEmail(email)) {
        setFieldError(form, "regEmail", true);
        ok = false;
      }
      if (!password || password.length < 8) {
        setFieldError(form, "regPassword", true);
        ok = false;
      }
      if (password !== confirm) {
        setFieldError(form, "regPasswordConfirm", true);
        ok = false;
      }

      if (!ok) {
        showModal("Registration issue", "Check all fields. Password must be at least 8 characters and match confirmation.", true);
        return;
      }

      if (window.WanderLuxApi) {
        WanderLuxApi.register(fullName, email, password)
          .then(function () {
            return syncWishlistFromServer();
          })
          .then(function () {
            showModal(
              "Account created",
              "Your WanderLux account is ready. Redirecting you home.",
              false
            );
            setTimeout(function () {
              window.location.href = "index.html";
            }, 1200);
          })
          .catch(function (err) {
            var msg =
              (err && err.message) ||
              "Registration failed. Try again or use a different email.";
            if (err && err.status === 409) {
              setFieldError(form, "regEmail", true);
              msg = "An account with this email already exists. Try logging in.";
            }
            showModal("Registration issue", msg, true);
          });
        return;
      }

      var users = getUsers();
      if (users.some(function (u) { return u.email === email; })) {
        setFieldError(form, "regEmail", true);
        showModal("Account exists", "An account with this email is already registered. Try logging in.", true);
        return;
      }

      users.push({
        fullName: fullName,
        email: email,
        password: password,
        createdAt: new Date().toISOString(),
      });
      saveUsers(users);

      showModal(
        "Account created",
        "Your WanderLux account is ready. Please sign in with your email and password.",
        false
      );
      setTimeout(function () {
        window.location.href = "login.html?registered=1";
      }, 1400);
    });
  }

  /* ——— Login ——— */
  function initLoginForm() {
    var form = $("#login-form");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearFieldErrors(form);

      var email = form.loginEmail.value.trim().toLowerCase();
      var password = form.loginPassword.value;

      if (!email || !isValidEmail(email)) {
        setFieldError(form, "loginEmail", true);
        showModal("Login failed", "Enter a valid email address.", true);
        return;
      }
      if (!password) {
        setFieldError(form, "loginPassword", true);
        showModal("Login failed", "Enter your password.", true);
        return;
      }

      if (window.WanderLuxApi) {
        WanderLuxApi.login(email, password)
          .then(function () {
            var localSaved = getSavedDestinationIds();
            if (!localSaved.length) {
              return null;
            }
            return WanderLuxApi.getSavedSlugs().then(function (serverSlugs) {
              var map = {};
              (serverSlugs || []).forEach(function (s) {
                map[s] = true;
              });
              localSaved.forEach(function (s) {
                map[s] = true;
              });
              var merged = Object.keys(map);
              setSavedDestinationIds(merged);
              return WanderLuxApi.setSavedSlugs(merged);
            });
          })
          .then(function () {
            var u = WanderLuxApi.getCurrentUser();
            showModal("Signed in", "Welcome back, " + (u ? u.fullName : "") + ".", false);
            setTimeout(function () {
              window.location.href = "index.html";
            }, 1200);
          })
          .catch(function () {
            showModal(
              "Login failed",
              "Email or password is incorrect. Create an account if you are new.",
              true
            );
          });
        return;
      }

      var users = getUsers();
      var found = users.find(function (u) {
        return u.email === email && u.password === password;
      });

      if (!found) {
        showModal("Login failed", "Email or password is incorrect. Create an account if you are new.", true);
        return;
      }

      setSession({ email: found.email, fullName: found.fullName });
      showModal("Signed in", "Welcome back, " + found.fullName + ".", false);
      setTimeout(function () {
        window.location.href = "index.html";
      }, 1200);
    });
  }

  function initAdminPage() {
    var root = $("#admin-dashboard");
    if (!root) return;

    var session = getSession();
    if (!window.WanderLuxApi || !session || String(session.role || "").toLowerCase() !== "admin") {
      root.innerHTML =
        "<div class=\"form-card admin-denied\"><h2>Admin access required</h2><p>Sign in with an admin account, or ask an owner to promote your user.</p><p><a class=\"btn btn--primary\" href=\"login.html\">Go to login</a></p></div>";
      return;
    }

    var statsWrap = $("#admin-stats");
    var usersWrap = $("#admin-users-list");
    var destWrap = $("#admin-destinations-list");
    var bookingsWrap = $("#admin-bookings-list");
    var logsWrap = $("#admin-audit-list");
    var destinationForm = $("#admin-destination-form");
    var bookingForm = $("#admin-booking-form");
    var lastDestList = [];
    var submitBtn = $("#admin-dest-submit");
    var userFilterEl = $("#admin-user-filter");
    var destFilterEl = $("#admin-dest-filter");
    var contactsWrap = $("#admin-contacts-list");
    var appointmentsWrap = $("#admin-appointments-list");
    var contactsPagerEl = $("#admin-contacts-pager");
    var appointmentsPagerEl = $("#admin-appointments-pager");
    var reviewsWrap = $("#admin-reviews-list");
    var reviewsPagerEl = $("#admin-reviews-pager");
    var reviewStatusFilter = $("#admin-review-status-filter");
    var bookingsPagerEl = $("#admin-bookings-pager");
    var auditPagerEl = $("#admin-audit-pager");
    var lastUsersRaw = [];
    var bookingPage = 1;
    var auditPage = 1;

    function renderPager(el, pagination, onGoToPage) {
      if (!el || !pagination || typeof onGoToPage !== "function") return;
      var total = Number(pagination.total) || 0;
      var pageSize = Number(pagination.pageSize) || 20;
      var page = Number(pagination.page) || 1;
      var pages = Math.max(1, Math.ceil(total / pageSize));
      if (pages <= 1 || total === 0) {
        el.hidden = true;
        el.innerHTML = "";
        return;
      }
      el.hidden = false;
      var prevDis = page <= 1 ? " disabled" : "";
      var nextDis = page >= pages ? " disabled" : "";
      el.innerHTML =
        '<span class="admin-pager__meta">Page ' +
        page +
        " of " +
        pages +
        " · " +
        total +
        ' total</span><span class="admin-pager__nav">' +
        '<button type="button" class="btn btn--ghost btn-small js-admin-pager-prev"' +
        prevDis +
        ">Previous</button>" +
        '<button type="button" class="btn btn--ghost btn-small js-admin-pager-next"' +
        nextDis +
        ">Next</button></span>";
      var prevBtn = el.querySelector(".js-admin-pager-prev");
      var nextBtn = el.querySelector(".js-admin-pager-next");
      if (prevBtn && !prevBtn.disabled) {
        prevBtn.onclick = function () {
          onGoToPage(page - 1);
        };
      }
      if (nextBtn && !nextBtn.disabled) {
        nextBtn.onclick = function () {
          onGoToPage(page + 1);
        };
      }
    }

    function bookingGuestSummary(b) {
      var u = b.user;
      if (u && typeof u === "object" && (u.email || u.fullName)) {
        var name = u.fullName || "";
        var em = u.email || "";
        if (name && em) return name + " · " + em;
        return em || name || "";
      }
      return (b.receiptEmail || "").trim();
    }

    function adminBookingPillClass(status) {
      var s = String(status || "draft").toLowerCase();
      if (s === "paid") return "admin-pill admin-pill--paid";
      if (s === "checkout") return "admin-pill admin-pill--checkout";
      if (s === "cancelled") return "admin-pill admin-pill--cancelled";
      return "admin-pill admin-pill--draft";
    }

    function loadStats() {
      WanderLuxApi.adminStats()
        .then(function (s) {
          if (!statsWrap) return;
          statsWrap.innerHTML =
            "<div class=\"admin-kpi admin-kpi--users\"><span class=\"admin-kpi__label\">Users</span><strong class=\"admin-kpi__value\">" +
            (s.usersTotal || 0) +
            "</strong></div>" +
            "<div class=\"admin-kpi admin-kpi--active\"><span class=\"admin-kpi__label\">Active users</span><strong class=\"admin-kpi__value\">" +
            (s.activeUsers || 0) +
            "</strong></div>" +
            "<div class=\"admin-kpi admin-kpi--admins\"><span class=\"admin-kpi__label\">Admins</span><strong class=\"admin-kpi__value\">" +
            (s.adminsTotal || 0) +
            "</strong></div>" +
            "<div class=\"admin-kpi admin-kpi--destinations\"><span class=\"admin-kpi__label\">Destinations</span><strong class=\"admin-kpi__value\">" +
            (s.destinationsTotal || 0) +
            "</strong></div>" +
            "<div class=\"admin-kpi admin-kpi--bookings\"><span class=\"admin-kpi__label\">Bookings</span><strong class=\"admin-kpi__value\">" +
            (s.bookingsTotal || 0) +
            "</strong></div>" +
            "<div class=\"admin-kpi admin-kpi--paid\"><span class=\"admin-kpi__label\">Paid bookings</span><strong class=\"admin-kpi__value\">" +
            (s.paidBookings || 0) +
            "</strong></div>" +
            "<div class=\"admin-kpi admin-kpi--revenue\"><span class=\"admin-kpi__label\">Deposits received</span><strong class=\"admin-kpi__value\">" +
            formatMoney(s.totalDeposits || 0) +
            "</strong></div>" +
            "<div class=\"admin-kpi admin-kpi--pipeline\"><span class=\"admin-kpi__label\">Package revenue (paid)</span><strong class=\"admin-kpi__value\">" +
            formatMoney(s.totalOrderValue || 0) +
            "</strong></div>" +
            "<div class=\"admin-kpi admin-kpi--contacts\"><span class=\"admin-kpi__label\">Contact msgs</span><strong class=\"admin-kpi__value\">" +
            (s.contactsTotal || 0) +
            "</strong></div>" +
            "<div class=\"admin-kpi admin-kpi--appointments\"><span class=\"admin-kpi__label\">Appointments</span><strong class=\"admin-kpi__value\">" +
            (s.appointmentsTotal || 0) +
            "</strong></div>";
        })
        .catch(function () {
          if (statsWrap) statsWrap.innerHTML = "<p>Failed to load stats.</p>";
        });
    }

    function attachUserRowHandlers() {
      if (!usersWrap) return;
      $$(".js-admin-role", usersWrap).forEach(function (btn) {
        btn.onclick = function () {
          WanderLuxApi.adminUpdateUserRole(btn.getAttribute("data-id"), btn.getAttribute("data-role"))
            .then(function () {
              loadUsers();
              loadStats();
              loadAuditLogsPaged(1);
            })
            .catch(function (err) {
              showModal("Could not update role", (err && err.message) || "Try again.", true);
            });
        };
      });
      $$(".js-admin-status", usersWrap).forEach(function (btn) {
        btn.onclick = function () {
          var nextActive = btn.getAttribute("data-active") === "1";
          WanderLuxApi.adminUpdateUserStatus(btn.getAttribute("data-id"), nextActive)
            .then(function () {
              loadUsers();
              loadStats();
              loadAuditLogsPaged(1);
            })
            .catch(function (err) {
              showModal("Could not update status", (err && err.message) || "Try again.", true);
            });
        };
      });
    }

    function renderUsersFiltered() {
      if (!usersWrap) return;
      var q = (userFilterEl && userFilterEl.value ? userFilterEl.value : "").trim().toLowerCase();
      var users = lastUsersRaw.filter(function (u) {
        if (!q) return true;
        return (
          String(u.fullName || "")
            .toLowerCase()
            .indexOf(q) !== -1 || String(u.email || "")
            .toLowerCase()
            .indexOf(q) !== -1
        );
      });
      if (!users.length) {
        usersWrap.innerHTML =
          "<li class=\"admin-empty-hint\">" +
          (lastUsersRaw.length ? "No users match your search." : "No users loaded.") +
          "</li>";
        return;
      }
      usersWrap.innerHTML = users
        .map(function (u) {
          var activeText = u.isActive ? "Active" : "Inactive";
          return (
            "<li class=\"admin-item admin-item--user\">" +
            "<div class=\"admin-item__main\">" +
            "<strong>" +
            escapeHtml(u.fullName || u.email) +
            "</strong><p>" +
            escapeHtml(u.email) +
            "</p>" +
            "<div class=\"admin-user-tags\">" +
            "<span class=\"admin-tag admin-tag--" +
            (u.role === "admin" ? "admin" : "customer") +
            "\">" +
            escapeHtml(u.role || "customer") +
            "</span>" +
            "<span class=\"admin-tag admin-tag--" +
            (u.isActive ? "active" : "inactive") +
            "\">" +
            activeText +
            "</span></div></div>" +
            "<div class=\"admin-actions\">" +
            "<button type=\"button\" class=\"btn btn--ghost btn-small js-admin-role\" data-id=\"" +
            u.id +
            "\" data-role=\"" +
            (u.role === "admin" ? "customer" : "admin") +
            "\">" +
            (u.role === "admin" ? "Make customer" : "Make admin") +
            "</button>" +
            "<button type=\"button\" class=\"btn btn--ghost btn-small js-admin-status\" data-id=\"" +
            u.id +
            "\" data-active=\"" +
            (u.isActive ? "0" : "1") +
            "\">" +
            (u.isActive ? "Deactivate" : "Activate") +
            "</button>" +
            "</div></li>"
          );
        })
        .join("");
      attachUserRowHandlers();
    }

    function loadUsers() {
      WanderLuxApi.adminUsers(1, 100)
        .then(function (r) {
          lastUsersRaw = (r && r.users) || [];
          renderUsersFiltered();
        })
        .catch(function () {
          lastUsersRaw = [];
          if (usersWrap) usersWrap.innerHTML = "<li>Failed to load users.</li>";
        });
    }

    function setPreview(url) {
      var prev = $("#admin-dest-preview");
      if (!prev) return;
      if (url) {
        prev.src = url;
        prev.removeAttribute("hidden");
      } else {
        prev.removeAttribute("src");
        prev.setAttribute("hidden", "hidden");
      }
    }

    function clearDestinationForm() {
      if (!destinationForm) return;
      destinationForm.reset();
      var orig = $("#admin-dest-original-slug");
      if (orig) orig.value = "";
      var dep = $("#admin-dest-deposit");
      if (dep) dep.value = "0.2";
      setPreview("");
      if (submitBtn) submitBtn.textContent = "Create trip";
      var fileIn = $("#admin-dest-image-file");
      if (fileIn) fileIn.value = "";
    }

    function fillDestinationForm(d) {
      if (!destinationForm) return;
      var orig = $("#admin-dest-original-slug");
      if (orig) orig.value = d.slug || "";
      destinationForm.slug.value = d.slug || "";
      destinationForm.title.value = d.title || "";
      destinationForm.price.value = d.price != null ? String(d.price) : "";
      destinationForm.depositPercent.value =
        d.depositPercent != null ? String(d.depositPercent) : "0.2";
      destinationForm.desc.value = d.desc || "";
      destinationForm.image.value = d.image || "";
      destinationForm.imageAlt.value = d.imageAlt || "";
      destinationForm.region.value = d.region || "";
      destinationForm.budgetTier.value = d.budgetTier || "";
      destinationForm.nights.value = d.nights != null ? String(d.nights) : "";
      destinationForm.rating.value = d.rating != null ? String(d.rating) : "";
      destinationForm.popularity.value = d.popularity != null ? String(d.popularity) : "";
      destinationForm.styles.value = Array.isArray(d.styles) ? d.styles.join(", ") : d.styles || "";
      destinationForm.timezone.value = d.timezone || "";
      destinationForm.bestSeason.value = d.bestSeason || "";
      destinationForm.lat.value = d.lat != null ? String(d.lat) : "";
      destinationForm.lng.value = d.lng != null ? String(d.lng) : "";
      destinationForm.included.value = Array.isArray(d.included) ? d.included.join("\n") : "";
      destinationForm.notIncluded.value = Array.isArray(d.notIncluded) ? d.notIncluded.join("\n") : "";
      destinationForm.faq.value = Array.isArray(d.faq)
        ? d.faq
            .map(function (f) {
              return (f.q || "") + "|" + (f.a || "");
            })
            .join("\n")
        : "";
      setPreview(d.image || "");
      if (submitBtn) submitBtn.textContent = "Update trip";
      var fileIn = $("#admin-dest-image-file");
      if (fileIn) fileIn.value = "";
    }

    function collectDestinationPayload() {
      function num(v) {
        var n = Number(v);
        return v === "" || v == null || Number.isNaN(n) ? undefined : n;
      }
      var f = destinationForm;
      var payload = {
        slug: f.slug.value.trim(),
        title: f.title.value.trim(),
        price: num(f.price.value),
        depositPercent: num(f.depositPercent.value),
        desc: f.desc.value.trim(),
        image: f.image.value.trim(),
        imageAlt: f.imageAlt.value.trim(),
        region: f.region.value.trim(),
        budgetTier: f.budgetTier.value.trim(),
        styles: f.styles.value.trim(),
        timezone: f.timezone.value.trim(),
        bestSeason: f.bestSeason.value.trim(),
        included: f.included.value,
        notIncluded: f.notIncluded.value,
        faq: f.faq.value,
      };
      var nN = num(f.nights.value);
      if (nN !== undefined) payload.nights = nN;
      var nR = num(f.rating.value);
      if (nR !== undefined) payload.rating = nR;
      var nP = num(f.popularity.value);
      if (nP !== undefined) payload.popularity = nP;
      var nLat = num(f.lat.value);
      if (nLat !== undefined) payload.lat = nLat;
      var nLng = num(f.lng.value);
      if (nLng !== undefined) payload.lng = nLng;
      return payload;
    }

    function attachDestinationRowHandlers() {
      if (!destWrap) return;
      $$(".js-admin-dest-delete", destWrap).forEach(function (btn) {
        btn.onclick = function () {
          var slug = btn.getAttribute("data-slug");
          WanderLuxApi.adminDeleteDestination(slug)
            .then(function () {
              loadDestinations();
              loadStats();
              loadAuditLogsPaged(1);
            })
            .catch(function (err) {
              showModal("Could not delete destination", (err && err.message) || "Try again.", true);
            });
        };
      });
      $$(".js-admin-dest-edit", destWrap).forEach(function (btn) {
        btn.onclick = function () {
          var slug = btn.getAttribute("data-slug");
          var d = lastDestList.filter(function (x) {
            return x.slug === slug;
          })[0];
          if (d) fillDestinationForm(d);
          var editor = $("#admin-editor");
          if (editor) editor.scrollIntoView({ behavior: "smooth", block: "start" });
        };
      });
    }

    function renderDestinationsFiltered() {
      if (!destWrap) return;
      var q = (destFilterEl && destFilterEl.value ? destFilterEl.value : "").trim().toLowerCase();
      var filtered = lastDestList.filter(function (d) {
        if (!q) return true;
        return (
          String(d.slug || "")
            .toLowerCase()
            .indexOf(q) !== -1 ||
          String(d.title || "")
            .toLowerCase()
            .indexOf(q) !== -1
        );
      });
      if (!filtered.length) {
        destWrap.innerHTML =
          "<li class=\"admin-empty-hint\">" +
          (lastDestList.length ? "No trips match your filter." : "No destinations loaded.") +
          "</li>";
        return;
      }
      destWrap.innerHTML = filtered
        .map(function (d) {
          var thumb = d.image
            ? "<img class=\"admin-list-thumb\" src=\"" + escapeHtml(d.image) + "\" alt=\"\">"
            : "<span class=\"admin-list-thumb admin-list-thumb--empty\" aria-hidden=\"true\"></span>";
          var previewHref = "checkout.html?dest=" + encodeURIComponent(d.slug || "");
          return (
            "<li class=\"admin-item admin-item--dest\">" +
            thumb +
            "<div class=\"admin-item__body\"><strong>" +
            escapeHtml(d.title || d.slug) +
            "</strong><p>" +
            escapeHtml(d.slug) +
            " · " +
            formatMoney(d.price || 0) +
            "</p></div>" +
            "<div class=\"admin-actions\">" +
            "<a class=\"btn btn--ghost btn-small\" href=\"" +
            previewHref +
            "\" target=\"_blank\" rel=\"noopener\">Preview</a>" +
            "<button type=\"button\" class=\"btn btn--ghost btn-small js-admin-dest-edit\" data-slug=\"" +
            escapeHtml(d.slug) +
            "\">Edit</button>" +
            "<button type=\"button\" class=\"btn btn--ghost btn-small js-admin-dest-delete\" data-slug=\"" +
            escapeHtml(d.slug) +
            "\">Delete</button>" +
            "</div></li>"
          );
        })
        .join("");
      attachDestinationRowHandlers();
    }

    function loadDestinations() {
      WanderLuxApi.adminDestinations(1, 100)
        .then(function (r) {
          lastDestList = (r && r.destinations) || [];
          renderDestinationsFiltered();
        })
        .catch(function () {
          lastDestList = [];
          if (destWrap) destWrap.innerHTML = "<li>Failed to load destinations.</li>";
        });
    }

    function bookingFilters() {
      var f = { page: bookingPage, pageSize: 15 };
      var st = $("#admin-booking-status");
      if (st && st.value) f.status = st.value;
      var sl = $("#admin-booking-slug");
      if (sl && sl.value.trim()) f.destinationSlug = sl.value.trim();
      var fromEl = $("#admin-booking-from");
      var toEl = $("#admin-booking-to");
      if (fromEl && fromEl.value) f.from = fromEl.value + "T00:00:00.000Z";
      if (toEl && toEl.value) f.to = toEl.value + "T23:59:59.999Z";
      return f;
    }

    function loadBookings() {
      WanderLuxApi.adminBookings(bookingFilters())
        .then(function (r) {
          var list = (r && r.bookings) || [];
          if (!bookingsWrap) return;
          bookingsWrap.innerHTML = list
            .map(function (b) {
              var guest = bookingGuestSummary(b);
              var guestLine = guest
                ? "<span class=\"admin-booking-row__dot\" aria-hidden=\"true\">·</span><span>" + escapeHtml(guest) + "</span>"
                : "<span class=\"admin-booking-row__dot\" aria-hidden=\"true\">·</span><span>Guest / no email</span>";
              return (
                "<li class=\"admin-item admin-item--booking\">" +
                "<div class=\"admin-booking-row\">" +
                "<div class=\"admin-booking-row__top\">" +
                "<strong>" +
                escapeHtml(b.ref) +
                "</strong>" +
                "<span class=\"" +
                adminBookingPillClass(b.status) +
                "\">" +
                escapeHtml(b.status || "draft") +
                "</span></div>" +
                "<p class=\"admin-booking-row__meta\">" +
                "<span>" +
                escapeHtml(b.destinationSlug || "—") +
                "</span>" +
                "<span class=\"admin-booking-row__dot\" aria-hidden=\"true\">·</span>" +
                "<span>Refund " +
                escapeHtml(b.refundStatus || "none") +
                "</span>" +
                "<span class=\"admin-booking-row__dot\" aria-hidden=\"true\">·</span>" +
                "<span>" +
                formatMoney(b.deposit || 0) +
                "</span>" +
                guestLine +
                "</p></div>" +
                "<div class=\"admin-actions\">" +
                "<button type=\"button\" class=\"btn btn--ghost btn-small js-admin-booking-fill\" data-ref=\"" +
                escapeHtml(b.ref) +
                "\">Use ref</button>" +
                "</div></li>"
              );
            })
            .join("");
          $$(".js-admin-booking-fill", bookingsWrap).forEach(function (btn) {
            btn.onclick = function () {
              if (!bookingForm) return;
              bookingForm.ref.value = btn.getAttribute("data-ref") || "";
              bookingForm.ref.focus();
              var noteEl = $("#admin-booking-update-heading");
              if (noteEl) noteEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
            };
          });
          renderPager(bookingsPagerEl, r.pagination, function (nextPage) {
            bookingPage = nextPage;
            loadBookings();
          });
        })
        .catch(function () {
          if (bookingsWrap) bookingsWrap.innerHTML = "<li>Failed to load bookings.</li>";
          if (bookingsPagerEl) {
            bookingsPagerEl.hidden = true;
            bookingsPagerEl.innerHTML = "";
          }
        });
    }

    function loadAuditLogsPaged(goPage) {
      if (typeof goPage === "number" && goPage >= 1) auditPage = goPage;
      WanderLuxApi.adminAuditLogs(auditPage, 25)
        .then(function (r) {
          var logs = (r && r.logs) || [];
          if (!logsWrap) return;
          logsWrap.innerHTML = logs
            .map(function (l) {
              return (
                "<li class=\"admin-item admin-item--audit\">" +
                "<div class=\"admin-audit-head\">" +
                "<span class=\"admin-audit-action\">" +
                escapeHtml(l.action || "") +
                "</span>" +
                "<span class=\"admin-audit-time\">" +
                new Date(l.createdAt).toLocaleString() +
                "</span></div>" +
                "<p class=\"admin-audit-body\">" +
                escapeHtml(l.actorEmail || "") +
                " · " +
                escapeHtml(l.targetType || "") +
                ":" +
                escapeHtml(l.targetId || "") +
                "</p></li>"
              );
            })
            .join("");
          renderPager(auditPagerEl, r.pagination, function (nextPage) {
            loadAuditLogsPaged(nextPage);
          });
        })
        .catch(function () {
          if (logsWrap) logsWrap.innerHTML = "<li>Failed to load audit logs.</li>";
          if (auditPagerEl) {
            auditPagerEl.hidden = true;
            auditPagerEl.innerHTML = "";
          }
        });
    }

    function loadContactInbox(page) {
      WanderLuxApi.adminContactMessages(page || 1, 15)
        .then(function (r) {
          var list = (r && r.messages) || [];
          if (!contactsWrap) return;
          if (!list.length) {
            contactsWrap.innerHTML = "<li class=\"admin-empty-hint\">No contact messages yet.</li>";
          } else {
            contactsWrap.innerHTML = list
              .map(function (m) {
                return (
                  "<li class=\"admin-item admin-item--inbox\">" +
                  "<div class=\"admin-inbox-head\"><strong>" +
                  escapeHtml(m.topic || "Message") +
                  "</strong><span class=\"admin-inbox-time\">" +
                  new Date(m.createdAt).toLocaleString() +
                  "</span></div>" +
                  "<p class=\"admin-inbox-meta\">" +
                  escapeHtml(m.name) +
                  ' · <a href="mailto:' +
                  encodeURIComponent(m.email) +
                  '">' +
                  escapeHtml(m.email) +
                  "</a></p>" +
                  "<p class=\"admin-inbox-body\">" +
                  escapeHtml(m.message || "") +
                  "</p></li>"
                );
              })
              .join("");
          }
          renderPager(contactsPagerEl, r.pagination, loadContactInbox);
        })
        .catch(function () {
          if (contactsWrap) contactsWrap.innerHTML = "<li>Could not load messages.</li>";
          if (contactsPagerEl) {
            contactsPagerEl.hidden = true;
            contactsPagerEl.innerHTML = "";
          }
        });
    }

    function loadReviews(page) {
      var status = reviewStatusFilter ? reviewStatusFilter.value : "pending";
      WanderLuxApi.adminReviews(page || 1, 15, status)
        .then(function (r) {
          var list = (r && r.reviews) || [];
          if (!reviewsWrap) return;
          if (!list.length) {
            reviewsWrap.innerHTML = "<li class=\"admin-empty-hint\">No reviews in this filter.</li>";
          } else {
            reviewsWrap.innerHTML = list
              .map(function (rev) {
                return (
                  "<li class=\"admin-item admin-item--inbox\">" +
                  "<div class=\"admin-inbox-head\"><strong>" +
                  escapeHtml(rev.destinationSlug) +
                  " · " +
                  starsHtml(rev.rating) +
                  "</strong><span class=\"admin-inbox-time\">" +
                  new Date(rev.createdAt).toLocaleString() +
                  "</span></div>" +
                  "<p class=\"admin-inbox-meta\">" +
                  escapeHtml(rev.authorName) +
                  " · ref " +
                  escapeHtml(rev.bookingRef) +
                  " · <span class=\"review-status-pill\">" +
                  escapeHtml(rev.status) +
                  "</span></p>" +
                  (rev.title ? "<p><strong>" + escapeHtml(rev.title) + "</strong></p>" : "") +
                  "<p class=\"admin-inbox-body\">" +
                  escapeHtml(rev.body || "") +
                  "</p>" +
                  '<div class="admin-review-actions">' +
                  '<button type="button" class="btn btn--outline btn-small" data-review-action="approved" data-review-id="' +
                  escapeHtml(rev.id) +
                  '">Approve</button>' +
                  '<button type="button" class="btn btn--ghost btn-small" data-review-action="rejected" data-review-id="' +
                  escapeHtml(rev.id) +
                  '">Reject</button>' +
                  "</div></li>"
                );
              })
              .join("");
            reviewsWrap.querySelectorAll("[data-review-action]").forEach(function (btn) {
              btn.addEventListener("click", function () {
                var id = btn.getAttribute("data-review-id");
                var action = btn.getAttribute("data-review-action");
                if (!id || !action) return;
                WanderLuxApi.adminUpdateReviewStatus(id, action)
                  .then(function () {
                    loadReviews(page || 1);
                  })
                  .catch(function (err) {
                    showModal("Review update failed", (err && err.message) || "Try again.", true);
                  });
              });
            });
          }
          renderPager(reviewsPagerEl, r.pagination, loadReviews);
        })
        .catch(function () {
          if (reviewsWrap) reviewsWrap.innerHTML = "<li>Could not load reviews.</li>";
          if (reviewsPagerEl) {
            reviewsPagerEl.hidden = true;
            reviewsPagerEl.innerHTML = "";
          }
        });
    }

    function loadAppointmentInbox(page) {
      WanderLuxApi.adminAppointmentRequests(page || 1, 15)
        .then(function (r) {
          var list = (r && r.appointments) || [];
          if (!appointmentsWrap) return;
          if (!list.length) {
            appointmentsWrap.innerHTML = "<li class=\"admin-empty-hint\">No appointment requests yet.</li>";
          } else {
            appointmentsWrap.innerHTML = list
              .map(function (a) {
                var telDigits = String(a.phone || "").replace(/\D/g, "");
                var phoneLink = telDigits
                  ? "<a href=\"tel:" + telDigits + "\">" + escapeHtml(a.phone || "") + "</a>"
                  : escapeHtml(a.phone || "");
                return (
                  "<li class=\"admin-item admin-item--inbox\">" +
                  "<div class=\"admin-inbox-head\"><strong>" +
                  escapeHtml(a.fullName || "Consultation") +
                  "</strong><span class=\"admin-inbox-time\">" +
                  new Date(a.createdAt).toLocaleString() +
                  "</span></div>" +
                  "<p class=\"admin-inbox-meta\">" +
                  '<a href="mailto:' +
                  encodeURIComponent(a.email || "") +
                  '">' +
                  escapeHtml(a.email || "") +
                  "</a> · " +
                  phoneLink +
                  " · Prefers <strong>" +
                  escapeHtml(a.preferredDate || "—") +
                  "</strong></p>" +
                  "<p class=\"admin-inbox-body\">" +
                  escapeHtml(a.message || "") +
                  "</p></li>"
                );
              })
              .join("");
          }
          renderPager(appointmentsPagerEl, r.pagination, loadAppointmentInbox);
        })
        .catch(function () {
          if (appointmentsWrap) appointmentsWrap.innerHTML = "<li>Could not load appointments.</li>";
          if (appointmentsPagerEl) {
            appointmentsPagerEl.hidden = true;
            appointmentsPagerEl.innerHTML = "";
          }
        });
    }

    WanderLuxApi.adminUploadConfig()
      .then(function (cfg) {
        var hint = $("#admin-cloudinary-hint");
        if (!hint) return;
        if (cfg && cfg.configured) {
          hint.textContent = "Cloudinary is configured — you can upload hero images for trips.";
          hint.classList.remove("admin-hint--warn");
        } else {
          hint.textContent =
            (cfg && cfg.hint) ||
            "Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to server .env to enable uploads.";
          hint.classList.add("admin-hint--warn");
        }
      })
      .catch(function () {
        var hint = $("#admin-cloudinary-hint");
        if (hint) hint.textContent = "Could not check upload configuration.";
      });

    var refreshStats = $("#admin-refresh-stats");
    if (refreshStats) refreshStats.onclick = loadStats;

    var clearBtn = $("#admin-dest-clear");
    if (clearBtn) clearBtn.onclick = clearDestinationForm;

    var uploadBtn = $("#admin-dest-upload-btn");
    if (uploadBtn) {
      uploadBtn.onclick = function () {
        var fileInput = $("#admin-dest-image-file");
        if (!fileInput || !fileInput.files || !fileInput.files[0]) {
          showModal("Choose a file", "Select an image before uploading.", true);
          return;
        }
        uploadBtn.disabled = true;
        WanderLuxApi.adminUploadImage(fileInput.files[0])
          .then(function (res) {
            if (destinationForm && res.url) {
              destinationForm.image.value = res.url;
              setPreview(res.url);
            }
            fileInput.value = "";
            showModal("Upload complete", "Image URL has been filled in. Save the trip to persist.", false);
          })
          .catch(function (err) {
            showModal("Upload failed", (err && err.message) || "Check Cloudinary credentials on the server.", true);
          })
          .finally(function () {
            uploadBtn.disabled = false;
          });
      };
    }

    var imgUrlInput = $("#admin-dest-image");
    if (imgUrlInput) {
      imgUrlInput.addEventListener("input", function () {
        setPreview(imgUrlInput.value.trim());
      });
    }

    if (destinationForm) {
      destinationForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var fileIn = $("#admin-dest-image-file");
        var runSave = function () {
          var payload = collectDestinationPayload();
          if (!payload.slug || !payload.title || payload.price == null) {
            showModal("Missing fields", "Slug, title, and price are required.", true);
            if (submitBtn) submitBtn.disabled = false;
            return;
          }
          var orig = $("#admin-dest-original-slug");
          var isEdit = orig && orig.value;
          var req = isEdit
            ? WanderLuxApi.adminUpdateDestination(orig.value, payload)
            : WanderLuxApi.adminCreateDestination(payload);
          req
            .then(function () {
              clearDestinationForm();
              loadDestinations();
              loadStats();
              loadAuditLogsPaged(1);
            })
            .catch(function (err) {
              showModal("Save failed", (err && err.message) || "Try again.", true);
            })
            .finally(function () {
              if (submitBtn) submitBtn.disabled = false;
            });
        };

        if (submitBtn) submitBtn.disabled = true;
        if (fileIn && fileIn.files && fileIn.files[0]) {
          WanderLuxApi.adminUploadImage(fileIn.files[0])
            .then(function (res) {
              if (res.url) {
                destinationForm.image.value = res.url;
                setPreview(res.url);
              }
              runSave();
            })
            .catch(function (err) {
              if (submitBtn) submitBtn.disabled = false;
              showModal("Image upload failed", (err && err.message) || "Fix Cloudinary config or remove the file.", true);
            });
        } else {
          runSave();
        }
      });
    }

    if (bookingForm) {
      bookingForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var ref = bookingForm.ref.value.trim();
        var payload = {
          status: bookingForm.status.value,
          refundStatus: bookingForm.refundStatus.value,
          adminPaymentNote: bookingForm.adminPaymentNote.value.trim(),
        };
        WanderLuxApi.adminUpdateBookingStatus(ref, payload)
          .then(function () {
            bookingForm.reset();
            loadBookings();
            loadStats();
            loadAuditLogsPaged(1);
          })
          .catch(function (err) {
            showModal("Could not update booking", (err && err.message) || "Try again.", true);
          });
      });
    }

    var br = $("#admin-bookings-refresh");
    if (br) {
      br.onclick = function () {
        bookingPage = 1;
        loadBookings();
      };
    }

    if (userFilterEl) {
      userFilterEl.addEventListener("input", function () {
        renderUsersFiltered();
      });
    }
    if (destFilterEl) {
      destFilterEl.addEventListener("input", function () {
        renderDestinationsFiltered();
      });
    }

    var cr = $("#admin-contacts-refresh");
    if (cr) cr.onclick = function () { loadContactInbox(1); };
    var ar = $("#admin-appointments-refresh");
    if (ar) ar.onclick = function () { loadAppointmentInbox(1); };

    loadStats();
    loadUsers();
    var reviewsRefresh = $("#admin-reviews-refresh");
    if (reviewsRefresh) reviewsRefresh.onclick = function () {
      loadReviews(1);
    };
    if (reviewStatusFilter) {
      reviewStatusFilter.addEventListener("change", function () {
        loadReviews(1);
      });
    }

    loadDestinations();
    loadContactInbox(1);
    loadAppointmentInbox(1);
    loadReviews(1);
    loadBookings();
    loadAuditLogsPaged(1);
  }

  /* ——— AOS ——— */
  function initAOS() {
    if (typeof AOS === "undefined") return;
    var reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    AOS.init({
      duration: reduceMotion ? 0 : 700,
      easing: "ease-out-cubic",
      once: true,
      offset: 40,
      disable: reduceMotion ? true : false,
    });
  }

  function startApp() {
    initThemeToggle();
    initNav();
    updateAuthNav();
    initAppointmentDateMin();
    initHeroSlider();
    initDestinationBooking();
    initTripDiscovery();
    initTripDetailButtons();
    initCompareTray();
    initCheckoutWizard();
    initPaymentPage();
    initConfirmationPage();
    initMyTripsPage();
    initVibeQuiz();
    initRecentTicker();
    initStripeConfigHint();
    initAppointmentForm();
    initContactForm();
    initRegisterForm();
    initLoginForm();
    initLoginWelcome();
    initAdminPage();
    initAOS();
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    if (document.querySelector(".grid-dest-cards, #trip-catalog-grid")) {
      showCatalogSkeletons();
    }
    if (window.WanderLuxApi) {
      window.WanderLuxApi
        .bootstrap()
        .catch(function () {
          /* trip-data.js fallback catalog */
        })
        .then(function () {
          return window.WanderLuxApi.meIfToken();
        })
        .catch(function () {
          /* ignore */
        })
        .finally(function () {
          hideCatalogSkeletons();
          updateApiStatusBanner();
          startApp();
        });
    } else {
      hideCatalogSkeletons();
      startApp();
    }
  });
})();
