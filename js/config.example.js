/**
 * Optional overrides — merge into js/config.js locally if needed.
 * Production uses js/config.js (API base auto: localhost vs Render).
 *
 * Stripe (optional; payments use Razorpay via the API by default):
 *   window.WANDERLUX_STRIPE_PK = "pk_test_...";
 *
 * Force API URL:
 *   window.WANDERLUX_API_BASE = "https://tourmatrix.onrender.com";
 */
window.WANDERLUX_STRIPE_PK = "pk_test_your_publishable_key_here";
