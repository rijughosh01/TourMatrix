/**
 * WanderLux API client — set window.WANDERLUX_API_BASE before this script if needed
 * (default http://localhost:5001). Loads before trip-data.js / main.js.
 */
(function (global) {
  "use strict";

  var API_ROOT = String(global.WANDERLUX_API_BASE || "http://localhost:5001").replace(/\/$/, "");
  var API = API_ROOT + "/api";
  var TOKEN_KEY = "wanderlux_token";

  var cachedUser = null;

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function clearToken() {
    setToken(null);
    cachedUser = null;
  }

  function getCurrentUser() {
    return cachedUser;
  }

  function fetchJson(method, path, body, sendAuth) {
    var headers = { Accept: "application/json" };
    if (body !== undefined && body !== null) {
      headers["Content-Type"] = "application/json";
    }
    if (sendAuth !== false) {
      var t = getToken();
      if (t) headers.Authorization = "Bearer " + t;
    }
    var opts = { method: method, headers: headers };
    if (body !== undefined && body !== null) {
      opts.body = JSON.stringify(body);
    }
    return fetch(API + path, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var msg = (data && data.error) || res.statusText || "Request failed";
          var err = new Error(msg);
          err.status = res.status;
          err.body = data;
          throw err;
        }
        return data;
      });
    });
  }

  function catalogKeyCount(cat) {
    return cat && typeof cat === "object" ? Object.keys(cat).length : 0;
  }

  var catalogLoadState = {
    status: "idle",
    error: null,
    fromApi: false,
    slow: false,
  };

  function getCatalogLoadState() {
    return catalogLoadState;
  }

  /**
   * Load catalog from API but never replace a good static catalog with an empty {} —
   * that happens when Mongo has no seeded destinations (Book / Details handlers would no-op).
   */
  function bootstrap() {
    var started = Date.now();
    var staticCat = global.WANDERLUX_TRIP_CATALOG;
    catalogLoadState = { status: "loading", error: null, fromApi: false, slow: false };
    return fetchJson("GET", "/destinations/catalog", null, false)
      .then(function (data) {
        var incoming = data && data.catalog ? data.catalog : null;
        var nStatic = catalogKeyCount(staticCat);
        var nIn = catalogKeyCount(incoming);
        if (nIn > 0) {
          global.WANDERLUX_TRIP_CATALOG =
            nStatic > 0 ? Object.assign({}, staticCat, incoming) : incoming;
        }
        catalogLoadState = {
          status: "ready",
          error: null,
          fromApi: nIn > 0,
          slow: Date.now() - started > 12000,
        };
        return data;
      })
      .catch(function (err) {
        catalogLoadState = {
          status: "error",
          error: (err && err.message) || "Could not reach the API",
          fromApi: false,
          slow: Date.now() - started > 12000,
        };
        return null;
      });
  }

  function getDestinationReviews(slug) {
    return fetchJson("GET", "/reviews/destination/" + encodeURIComponent(slug), null, false).then(function (d) {
      return { reviews: d.reviews || [], summary: d.summary || { averageRating: 0, count: 0 } };
    });
  }

  function getMyReviews() {
    return fetchJson("GET", "/reviews/my", null, true).then(function (d) {
      return d.reviews || [];
    });
  }

  function getReviewEligibility(bookingRef) {
    return fetchJson("GET", "/reviews/booking/" + encodeURIComponent(bookingRef), null, true);
  }

  function submitReview(bookingRef, rating, title, body) {
    return fetchJson(
      "POST",
      "/reviews",
      { bookingRef: bookingRef, rating: rating, title: title || "", body: body || "" },
      true
    ).then(function (d) {
      return d.review;
    });
  }

  function adminReviews(page, pageSize, status) {
    var q = "?page=" + (page || 1) + "&pageSize=" + (pageSize || 20);
    if (status) q += "&status=" + encodeURIComponent(status);
    return fetchJson("GET", "/admin/reviews" + q, null, true);
  }

  function adminUpdateReviewStatus(reviewId, status) {
    return fetchJson("PATCH", "/admin/reviews/" + encodeURIComponent(reviewId), { status: status }, true).then(
      function (d) {
        return d.review;
      }
    );
  }

  function meIfToken() {
    if (!getToken()) {
      cachedUser = null;
      return Promise.resolve(null);
    }
    return fetchJson("GET", "/auth/me", null, true)
      .then(function (d) {
        cachedUser = d.user;
        try {
          localStorage.setItem(
            "wanderlux_session",
            JSON.stringify({ email: d.user.email, fullName: d.user.fullName, role: d.user.role || "customer" })
          );
        } catch (e) {
          /* ignore */
        }
        return d.user;
      })
      .catch(function () {
        clearToken();
        try {
          localStorage.removeItem("wanderlux_session");
        } catch (e2) {
          /* ignore */
        }
        return null;
      });
  }

  function register(fullName, email, password) {
    return fetchJson(
      "POST",
      "/auth/register",
      { fullName: fullName, email: email, password: password },
      false
    ).then(function (d) {
      if (d.token) setToken(d.token);
      cachedUser = d.user;
      try {
        localStorage.setItem(
          "wanderlux_session",
          JSON.stringify({ email: d.user.email, fullName: d.user.fullName, role: d.user.role || "customer" })
        );
      } catch (e) {
        /* ignore */
      }
      return d;
    });
  }

  function login(email, password) {
    return fetchJson("POST", "/auth/login", { email: email, password: password }, false).then(function (d) {
      if (d.token) setToken(d.token);
      cachedUser = d.user;
      try {
        localStorage.setItem(
          "wanderlux_session",
          JSON.stringify({ email: d.user.email, fullName: d.user.fullName, role: d.user.role || "customer" })
        );
      } catch (e) {
        /* ignore */
      }
      return d;
    });
  }

  function logout() {
    clearToken();
    try {
      localStorage.removeItem("wanderlux_session");
    } catch (e) {
      /* ignore */
    }
  }

  function getSavedSlugs() {
    return fetchJson("GET", "/users/me/saved", null, true).then(function (d) {
      return d.slugs || [];
    });
  }

  function setSavedSlugs(slugs) {
    return fetchJson("PATCH", "/users/me/saved", { slugs: slugs }, true).then(function (d) {
      return d.slugs || [];
    });
  }

  function startBooking(destinationSlug) {
    return fetchJson("POST", "/bookings/start", { destinationSlug: destinationSlug }, true);
  }

  function getBookingByRef(ref) {
    return fetchJson("GET", "/bookings/ref/" + encodeURIComponent(ref), null, false);
  }

  function patchCheckout(ref, checkoutPatch) {
    return fetchJson("PATCH", "/bookings/ref/" + encodeURIComponent(ref) + "/checkout", checkoutPatch, true);
  }

  function payBooking(ref, payload) {
    return fetchJson("POST", "/bookings/ref/" + encodeURIComponent(ref) + "/pay", payload, true);
  }

  function createRazorpayOrder(ref) {
    return fetchJson("POST", "/bookings/ref/" + encodeURIComponent(ref) + "/razorpay-order", {}, true);
  }

  function myPaidBookings() {
    return fetchJson("GET", "/bookings/my", null, true).then(function (d) {
      return d.bookings || [];
    });
  }

  function sendContact(name, email, topic, message) {
    return fetchJson("POST", "/contact", { name: name, email: email, topic: topic, message: message }, false);
  }

  function sendAppointment(fullName, email, phone, preferredDate, message) {
    return fetchJson(
      "POST",
      "/appointments",
      { fullName: fullName, email: email, phone: phone, preferredDate: preferredDate, message: message },
      false
    );
  }

  function adminStats() {
    return fetchJson("GET", "/admin/stats", null, true).then(function (d) {
      return d.stats || {};
    });
  }

  function adminUsers(page, pageSize) {
    var p = Number(page) || 1;
    var ps = Number(pageSize) || 20;
    return fetchJson("GET", "/admin/users?page=" + p + "&pageSize=" + ps, null, true);
  }

  function adminUpdateUserRole(userId, role) {
    return fetchJson("PATCH", "/admin/users/" + encodeURIComponent(userId) + "/role", { role: role }, true);
  }

  function adminUpdateUserStatus(userId, isActive) {
    return fetchJson(
      "PATCH",
      "/admin/users/" + encodeURIComponent(userId) + "/status",
      { isActive: !!isActive },
      true
    );
  }

  function adminDestinations(page, pageSize) {
    var p = Number(page) || 1;
    var ps = Number(pageSize) || 20;
    return fetchJson("GET", "/admin/destinations?page=" + p + "&pageSize=" + ps, null, true);
  }

  function adminCreateDestination(payload) {
    return fetchJson("POST", "/admin/destinations", payload, true);
  }

  function adminUpdateDestination(slug, payload) {
    return fetchJson("PATCH", "/admin/destinations/" + encodeURIComponent(slug), payload, true);
  }

  function adminDeleteDestination(slug) {
    return fetchJson("DELETE", "/admin/destinations/" + encodeURIComponent(slug), null, true);
  }

  function adminBookings(filters) {
    var f = filters || {};
    var query = [];
    if (f.status) query.push("status=" + encodeURIComponent(f.status));
    if (f.destinationSlug) query.push("destinationSlug=" + encodeURIComponent(f.destinationSlug));
    if (f.from) query.push("from=" + encodeURIComponent(f.from));
    if (f.to) query.push("to=" + encodeURIComponent(f.to));
    query.push("page=" + encodeURIComponent(Number(f.page) || 1));
    query.push("pageSize=" + encodeURIComponent(Number(f.pageSize) || 20));
    return fetchJson("GET", "/admin/bookings?" + query.join("&"), null, true);
  }

  function adminUpdateBookingStatus(ref, payload) {
    return fetchJson("PATCH", "/admin/bookings/" + encodeURIComponent(ref) + "/status", payload || {}, true);
  }

  function adminAuditLogs(page, pageSize) {
    var p = Number(page) || 1;
    var ps = Number(pageSize) || 20;
    return fetchJson("GET", "/admin/audit-logs?page=" + p + "&pageSize=" + ps, null, true);
  }

  function adminContactMessages(page, pageSize) {
    var p = Number(page) || 1;
    var ps = Number(pageSize) || 20;
    return fetchJson("GET", "/admin/contact-messages?page=" + p + "&pageSize=" + ps, null, true);
  }

  function adminAppointmentRequests(page, pageSize) {
    var p = Number(page) || 1;
    var ps = Number(pageSize) || 20;
    return fetchJson("GET", "/admin/appointment-requests?page=" + p + "&pageSize=" + ps, null, true);
  }

  function adminUploadConfig() {
    return fetchJson("GET", "/admin/upload-config", null, true);
  }

  function aiStatus() {
    return fetchJson("GET", "/ai/status", null, false);
  }

  function aiChat(message, history) {
    return fetchJson("POST", "/ai/chat", { message: message, history: history || [] }, false);
  }

  function adminUploadImage(file) {
    var token = getToken();
    if (!token) {
      return Promise.reject(new Error("Not signed in"));
    }
    var fd = new FormData();
    fd.append("image", file);
    return fetch(API + "/admin/upload-image", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: fd,
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || "Upload failed");
          err.status = res.status;
          err.body = data;
          throw err;
        }
        return data;
      });
    });
  }

  global.WanderLuxApi = {
    API_ROOT: API_ROOT,
    bootstrap: bootstrap,
    getCatalogLoadState: getCatalogLoadState,
    getDestinationReviews: getDestinationReviews,
    getMyReviews: getMyReviews,
    getReviewEligibility: getReviewEligibility,
    submitReview: submitReview,
    adminReviews: adminReviews,
    adminUpdateReviewStatus: adminUpdateReviewStatus,
    meIfToken: meIfToken,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    getCurrentUser: getCurrentUser,
    register: register,
    login: login,
    logout: logout,
    getSavedSlugs: getSavedSlugs,
    setSavedSlugs: setSavedSlugs,
    startBooking: startBooking,
    getBookingByRef: getBookingByRef,
    patchCheckout: patchCheckout,
    payBooking: payBooking,
    createRazorpayOrder: createRazorpayOrder,
    myPaidBookings: myPaidBookings,
    sendContact: sendContact,
    sendAppointment: sendAppointment,
    adminStats: adminStats,
    adminUsers: adminUsers,
    adminUpdateUserRole: adminUpdateUserRole,
    adminUpdateUserStatus: adminUpdateUserStatus,
    adminDestinations: adminDestinations,
    adminCreateDestination: adminCreateDestination,
    adminUpdateDestination: adminUpdateDestination,
    adminDeleteDestination: adminDeleteDestination,
    adminBookings: adminBookings,
    adminUpdateBookingStatus: adminUpdateBookingStatus,
    adminAuditLogs: adminAuditLogs,
    adminContactMessages: adminContactMessages,
    adminAppointmentRequests: adminAppointmentRequests,
    adminUploadConfig: adminUploadConfig,
    adminUploadImage: adminUploadImage,
    aiStatus: aiStatus,
    aiChat: aiChat,
  };
})(typeof window !== "undefined" ? window : globalThis);
