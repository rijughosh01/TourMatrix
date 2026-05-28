(function () {
  "use strict";

  const SocialShare = {
    // Supported platforms
    platforms: {
      facebook: {
        name: "Facebook",
        icon: "📘",
        share: function (url, title) {
          return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(title)}`;
        },
      },
      twitter: {
        name: "Twitter / X",
        icon: "𝕏",
        share: function (url, title) {
          return `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
        },
      },
      linkedin: {
        name: "LinkedIn",
        icon: "💼",
        share: function (url, title) {
          return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
        },
      },
      whatsapp: {
        name: "WhatsApp",
        icon: "💬",
        share: function (url, title) {
          return `https://api.whatsapp.com/send?text=${encodeURIComponent(title + " " + url)}`;
        },
      },
      email: {
        name: "Email",
        icon: "✉️",
        share: function (url, title) {
          return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent("Check out this trip: " + url)}`;
        },
      },
      telegram: {
        name: "Telegram",
        icon: "📲",
        share: function (url, title) {
          return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
        },
      },
    },

    /**
     * Generate a shareable URL for a trip
     * @param {string} tripSlug - The trip slug
     * @param {string} tripName - The trip name
     * @returns {string} The full shareable URL
     */
    generateTripUrl: function (tripSlug, tripName) {
      const baseUrl = window.location.origin;
      const params = new URLSearchParams({
        ref: tripSlug,
        name: tripName,
      });
      return `${baseUrl}/booking.html?${params.toString()}`;
    },

    /**
     * Generate a shareable URL for a review
     * @param {string} tripSlug - The trip slug
     * @param {string} reviewId - The review ID
     * @returns {string} The full shareable URL
     */
    generateReviewUrl: function (tripSlug, reviewId) {
      const baseUrl = window.location.origin;
      const params = new URLSearchParams({
        trip: tripSlug,
        review: reviewId,
      });
      return `${baseUrl}/booking.html?${params.toString()}`;
    },

    /**
     * Create a share button HTML string
     * @param {string} platform - The platform key
     * @param {string} url - The URL to share
     * @param {string} title - The share title
     * @returns {string} HTML for the share button
     */
    createShareButton: function (platform, url, title) {
      const p = this.platforms[platform];
      if (!p) return "";

      const shareUrl = p.share(url, title);
      return `
        <a href="${shareUrl}"
           class="share-btn share-btn--${platform}"
           title="Share on ${p.name}"
           target="_blank"
           rel="noopener noreferrer"
           aria-label="Share on ${p.name}">
          <span class="share-btn__icon">${p.icon}</span>
          <span class="share-btn__label">${p.name}</span>
        </a>
      `;
    },

    /**
     * Create a complete share menu
     * @param {string} url - The URL to share
     * @param {string} title - The share title
     * @param {Array} platformList - List of platforms to include (default: all)
     * @returns {string} HTML for the share menu
     */
    createShareMenu: function (url, title, platformList = null) {
      const platforms = platformList || Object.keys(this.platforms);
      let html = '<div class="share-menu" role="region" aria-label="Share options">';

      platforms.forEach((platform) => {
        if (this.platforms[platform]) {
          html += this.createShareButton(platform, url, title);
        }
      });

      html += "</div>";
      return html;
    },

    /**
     * Open share popup window
     * @param {string} url - The URL to share
     * @param {string} platform - The platform to share on
     */
    openShareWindow: function (url, platform) {
      const p = this.platforms[platform];
      if (!p) return;

      const shareUrl = p.share(url, "");
      const width = 600;
      const height = 400;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      window.open(
        shareUrl,
        `share-${platform}`,
        `width=${width},height=${height},left=${left},top=${top}`
      );
    },

    /**
     * Copy shareable link to clipboard
     * @param {string} url - The URL to copy
     * @returns {Promise} Resolves when copied
     */
    copyToClipboard: async function (url) {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          return true;
        } else {
          // Fallback for older browsers
          const textarea = document.createElement("textarea");
          textarea.value = url;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
          return true;
        }
      } catch (err) {
        console.error("Failed to copy:", err);
        return false;
      }
    },

    /**
     * Track a share event (can be sent to analytics)
     * @param {string} platform - The platform
     * @param {string} tripSlug - The trip slug
     */
    trackShare: function (platform, tripSlug) {
      // Send to backend for analytics
      try {
        fetch("/api/share-track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform,
            tripSlug,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
          }),
        }).catch(() => {}); // Silently fail if not available
      } catch (e) {
        // Ignore analytics errors
      }
    },

    /**
     * Initialize share buttons with click handlers
     */
    init: function () {
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(".share-btn");
        if (!btn) return;

        const platform = btn.classList.value.match(/share-btn--(\w+)/)?.[1];
        const tripSlug = btn.dataset.tripSlug;

        if (platform && tripSlug) {
          this.trackShare(platform, tripSlug);
        }
      });
    },
  };

  // Expose to global scope
  window.SocialShare = SocialShare;
})();
