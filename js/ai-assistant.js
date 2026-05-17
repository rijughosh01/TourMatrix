/**
 * TourMatrix AI assistant — floating chat (bottom-left).
 * Requires WanderLuxApi + OPENAI_API_KEY on the server.
 */
(function () {
  "use strict";

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
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

  function initAiAssistant() {
    if (!window.WanderLuxApi || $("#ai-assistant-root")) return;

    var root = document.createElement("div");
    root.id = "ai-assistant-root";
    root.className = "ai-assistant-root";
    root.innerHTML =
      '<div id="ai-assistant-panel" class="ai-assistant-panel" hidden aria-hidden="true">' +
      '<header class="ai-assistant-panel__head">' +
      '<div class="ai-assistant-panel__title-wrap">' +
      "<h2>TourMatrix AI</h2>" +
      "<p>Trip ideas, booking help &amp; site guide</p>" +
      "</div>" +
      '<button type="button" class="ai-assistant-panel__close" id="ai-assistant-close" aria-label="Close AI chat">&times;</button>' +
      "</header>" +
      '<div id="ai-assistant-messages" class="ai-assistant-messages" role="log" aria-live="polite"></div>' +
      '<form id="ai-assistant-form" class="ai-assistant-form">' +
      '<label class="visually-hidden" for="ai-assistant-input">Ask TourMatrix AI</label>' +
      '<textarea id="ai-assistant-input" rows="2" placeholder="e.g. 5 days, beach, under $3000…" maxlength="2000"></textarea>' +
      '<button type="submit" class="btn btn--primary btn--small" id="ai-assistant-send">Send</button>' +
      "</form>" +
      "</div>" +
      '<button type="button" id="ai-assistant-fab" class="ai-assistant-fab" aria-label="Open TourMatrix AI assistant" aria-expanded="false" title="AI trip planner">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M12 3a7 7 0 00-7 7v2l-2 2v3h18v-3l-2-2v-2a7 7 0 00-7-7z"/>' +
      '<path d="M9 21h6"/>' +
      "</svg>" +
      "<span>AI</span>" +
      "</button>";

    document.body.appendChild(root);

    var panel = $("#ai-assistant-panel");
    var fab = $("#ai-assistant-fab");
    var closeBtn = $("#ai-assistant-close");
    var messagesEl = $("#ai-assistant-messages");
    var form = $("#ai-assistant-form");
    var input = $("#ai-assistant-input");
    var sendBtn = $("#ai-assistant-send");
    var history = [];
    var configured = false;
    var welcomeShown = false;

    function setOpen(open) {
      panel.hidden = !open;
      panel.setAttribute("aria-hidden", open ? "false" : "true");
      fab.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && !welcomeShown) {
        welcomeShown = true;
        appendMessage(
          "assistant",
          configured
            ? "Hi! I'm TourMatrix AI. Ask for trip ideas (e.g. “5 days, beach, under $3000”), or how booking, payment, and My trips work."
            : "AI is not configured yet. Add OPENAI_API_KEY to server/.env, restart the API, then refresh this page."
        );
      }
      if (open) input.focus();
    }

    function appendMessage(role, text, suggestions) {
      var wrap = document.createElement("div");
      wrap.className = "ai-msg ai-msg--" + role;
      var bubble = document.createElement("div");
      bubble.className = "ai-msg__bubble";
      bubble.textContent = text;
      wrap.appendChild(bubble);

      if (suggestions && suggestions.length) {
        var cards = document.createElement("div");
        cards.className = "ai-msg__cards";
        suggestions.forEach(function (s) {
          var slug = s.slug;
          var cat = getCatalogEntry(slug) || s;
          var a = document.createElement("a");
          a.className = "ai-trip-card";
          a.href = "booking.html";
          a.innerHTML =
            "<strong>" +
            escapeHtml(cat.title || slug) +
            "</strong>" +
            "<span>" +
            formatMoney(cat.price || s.price) +
            " · " +
            (cat.nights || s.nights || "?") +
            " nights</span>";
          cards.appendChild(a);
        });
        wrap.appendChild(cards);
      }

      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function appendTyping() {
      var el = document.createElement("div");
      el.className = "ai-msg ai-msg--assistant ai-msg--typing";
      el.id = "ai-typing-indicator";
      el.innerHTML = '<div class="ai-msg__bubble">Thinking…</div>';
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeTyping() {
      var t = $("#ai-typing-indicator");
      if (t) t.remove();
    }

    fab.addEventListener("click", function () {
      setOpen(panel.hidden);
    });
    closeBtn.addEventListener("click", function () {
      setOpen(false);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!configured) {
        appendMessage(
          "assistant",
          "Server needs OPENAI_API_KEY in server/.env. Restart the API after adding your key."
        );
        return;
      }
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      sendBtn.disabled = true;
      appendMessage("user", text);
      history.push({ role: "user", content: text });
      appendTyping();

      WanderLuxApi.aiChat(text, history.slice(0, -1))
        .then(function (data) {
          removeTyping();
          var reply = data.reply || "Here are some options for you.";
          appendMessage("assistant", reply, data.suggestions || []);
          history.push({ role: "assistant", content: reply });
          if (history.length > 16) history = history.slice(-16);
        })
        .catch(function (err) {
          removeTyping();
          appendMessage(
            "assistant",
            (err && err.message) || "Sorry, I could not respond. Check the API is running."
          );
        })
        .finally(function () {
          sendBtn.disabled = false;
        });
    });

    WanderLuxApi.aiStatus()
      .then(function (st) {
        configured = !!(st && st.configured);
      })
      .catch(function () {
        configured = false;
      });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAiAssistant);
  } else {
    initAiAssistant();
  }
})();
