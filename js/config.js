/**
 * Frontend runtime config — loaded before js/api.js on every page.
 * Local dev (Live Server): API at localhost:5001. Production: Render backend.
 */
(function (global) {
  "use strict";

  var host = global.location && global.location.hostname ? global.location.hostname : "";
  var isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "" ||
    host.endsWith(".local");

  global.WANDERLUX_API_BASE = isLocal
    ? "http://localhost:5001"
    : "https://tourmatrix.onrender.com";
})(window);
