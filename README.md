# TourMatrix Travel Agency

A full-stack travel booking platform for curated holidays, guided tours, and deposit payments. Visitors browse packages, book online, pay via Razorpay, and manage trips from their account. Admins manage the catalog, bookings, inbox, and reviews from a dashboard.

**Live demo (typical setup)**

| Service | URL |
|--------|-----|
| Frontend (Netlify) | [https://tourmatrix.netlify.app](https://tourmatrix.netlify.app) |
| API (Render) | [https://tourmatrix.onrender.com](https://tourmatrix.onrender.com) |

---

## Features

### Public website
- **Home** — hero slider, featured packages, vibe quiz, testimonials
- **Destinations & booking** — searchable/filterable catalog (region, budget, style, nights, sort)
- **Trip details** — modal with map, inclusions, FAQ, and approved reviews
- **Compare tray** — compare 2–3 packages side by side
- **Checkout wizard** — traveller details, dates, add-ons synced to the API
- **Razorpay payments** — deposit checkout branded as **TourMatrix Travel Agency**
- **Confirmation** — booking reference after payment
- **My trips** — deposit history, wishlist, and review submission
- **Contact & appointments** — forms stored in MongoDB
- **Policies** — pricing and deposit policy
- **Dark mode** — floating toggle (bottom-right)
- **AI trip planner** — OpenAI-powered chat (bottom-left); suggests real packages from your MongoDB catalog and answers site questions
- **Loading UX** — skeleton loaders on destination grids; API status banner with retry (cold-start friendly for Render)

### Accounts
- Register / login (JWT)
- **Wishlist** — heart on package cards; syncs across devices when logged in
- **Reviews** — post-trip reviews tied to paid booking refs; **admin moderation** before public display

### Admin dashboard (`admin.html`)
- Stats overview
- Destination CRUD + Cloudinary image upload
- User role / active status
- Bookings filter and status updates
- Contact messages & appointment inbox
- **Review moderation** (approve / reject)
- Audit log

---

## Tech stack

| Layer | Technologies |
|-------|----------------|
| Frontend | HTML5, CSS3 (custom properties, dark theme), vanilla JavaScript |
| UI | AOS animations, Fraunces + Plus Jakarta Sans |
| Backend | Node.js 18+, Express 4 |
| Database | MongoDB (Mongoose) |
| Auth | JWT (`bcryptjs`) |
| Payments | Razorpay |
| Media | Cloudinary (admin uploads) |
| AI | OpenAI API (`gpt-4o-mini` by default) |
| Hosting | Netlify (static site) + Render (API) |

---

## Project structure

```
TourMatrix/
├── index.html              # Home
├── booking.html            # Catalog + filters
├── destinations.html
├── checkout.html
├── payment.html
├── confirmation.html
├── my-trips.html
├── login.html / register.html
├── admin.html
├── contact.html / appointment.html / about.html / policies.html
├── css/
│   └── style.css           # Global styles, dark mode, AI chat, skeletons
├── js/
│   ├── config.js           # API base URL (local vs production)
│   ├── config.example.js
│   ├── api.js              # REST client (WanderLuxApi)
│   ├── trip-data.js        # Embedded catalog fallback
│   ├── main.js             # App logic (nav, booking, admin, …)
│   └── ai-assistant.js     # AI chat UI
├── netlify.toml            # Static deploy config
├── vercel.json             # Optional static deploy
└── server/
    ├── src/
    │   ├── index.js        # Express app
    │   ├── config/db.js
    │   ├── middleware/auth.js
    │   ├── models/         # User, Destination, Booking, Review, …
    │   └── routes/         # auth, bookings, admin, ai, reviews, …
    ├── scripts/
    │   ├── seedDestinations.js
    │   ├── seedAdmin.js
    │   └── extract-catalog.js
    ├── data/catalog.json
    ├── .env.example
    └── package.json
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [MongoDB](https://www.mongodb.com/) local or [Atlas](https://www.mongodb.com/atlas) cluster
- [Razorpay](https://razorpay.com/) test/live keys (for payments)
- [OpenAI](https://platform.openai.com/) API key (for AI assistant)
- Optional: [Cloudinary](https://cloudinary.com/) (admin image uploads)

---

## Local development

### 1. Clone and open the repo

```bash
git clone https://github.com/rijughosh01/TourMatrix.git
cd TourMatrix
```

### 2. Backend setup

```bash
cd server
cp .env.example .env
```

Edit `server/.env` — minimum:

```env
PORT=5001
MONGODB_URI=mongodb://127.0.0.1:27017/wanderlux
JWT_SECRET=your_long_random_secret_at_least_32_chars
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
OPENAI_API_KEY=sk-...
CORS_ORIGIN=http://127.0.0.1:5500,http://localhost:5500
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=your_secure_password
```

Install and run:

```bash
npm install
npm run seed          # Load destinations from data/catalog.json
npm run seed:admin    # Create admin user
npm run dev           # API at http://localhost:5001
```

### 3. Frontend setup

Open the **repository root** (not `server/`) with [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) or any static server on port **5500**.

`js/config.js` automatically points to:

- `http://localhost:5001` on localhost
- `https://tourmatrix.onrender.com` in production

### 4. Verify

- Frontend: `http://127.0.0.1:5500/index.html`
- API health: `http://localhost:5001/api/health`
- Catalog: `http://localhost:5001/api/destinations/catalog`

---

## Environment variables

See [`server/.env.example`](server/.env.example) for the full list.

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Sign login tokens (min 16 chars) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Payment gateway |
| `OPENAI_API_KEY` | AI trip planner (server only) |
| `OPENAI_MODEL` | Optional (default `gpt-4o-mini`) |
| `CORS_ORIGIN` | Comma-separated frontend URLs |
| `CLOUDINARY_*` | Admin destination image uploads |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Used by `npm run seed:admin` |

**Never commit `server/.env` or expose API keys in the frontend.**

---

## Deployment

### Backend (Render)

1. New **Web Service** → connect GitHub repo.
2. **Root directory:** `server`
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. Add all environment variables from `.env.example`.
6. Set `CORS_ORIGIN` to your frontend URL, e.g.  
   `https://tourmatrix.netlify.app,http://localhost:5500`

### Frontend (Netlify)

1. Import the repo on [Netlify](https://www.netlify.com/).
2. **Publish directory:** `.` (repo root)
3. **Build command:** leave empty (static site).
4. `netlify.toml` is already configured.

After deploy, confirm the frontend calls your Render API (`js/config.js` production URL).

---

## API overview

Base URL: `/api` (e.g. `https://tourmatrix.onrender.com/api`)

| Area | Endpoints |
|------|-----------|
| Health | `GET /health` |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Destinations | `GET /destinations/catalog` |
| Bookings | `POST /bookings/start`, `PATCH /bookings/ref/:ref/checkout`, `POST /bookings/ref/:ref/razorpay-order`, `POST /bookings/ref/:ref/pay`, `GET /bookings/my` |
| Wishlist | `GET /users/me/saved`, `PATCH /users/me/saved` |
| Reviews | `GET /reviews/destination/:slug`, `POST /reviews`, `GET /reviews/my` |
| AI | `GET /ai/status`, `POST /ai/chat` |
| Contact | `POST /contact`, `POST /appointments` |
| Admin | `/admin/*` (stats, destinations, users, bookings, inbox, reviews, audit) |

Authenticated routes use header: `Authorization: Bearer <token>`.

---

## NPM scripts (server)

| Command | Description |
|---------|-------------|
| `npm start` | Production API |
| `npm run dev` | Dev server with nodemon |
| `npm run seed` | Upsert destinations from `data/catalog.json` |
| `npm run seed:admin` | Create/update admin user |
| `npm run extract-catalog` | Regenerate `catalog.json` from `js/trip-data.js` |

---

## User flows

1. **Browse** → `booking.html` → filter/search packages  
2. **Book** → `checkout.html` → fill traveller details  
3. **Pay** → `payment.html` → Razorpay deposit  
4. **Confirm** → `confirmation.html?ref=WLX-...`  
5. **Account** → `my-trips.html` → history, wishlist, reviews  
6. **Admin** → log in as admin → `admin.html`

---

## AI assistant

- Floating **AI** button (bottom-left) on all main pages.
- Sends messages to `POST /api/ai/chat` with your MongoDB catalog in context.
- Returns up to **3 package suggestions** (valid slugs only) plus a plain-text reply.
- Requires `OPENAI_API_KEY` on the server; check `GET /api/ai/status`.

Example prompts:

- `5 days, beach, under $3000`
- `How do I pay my deposit?`
- `Romantic trip in Europe for a week`

---

## Security notes

- JWT and payment secrets live only on the server.
- Rate limiting on auth, admin, contact, bookings, and AI routes.
- CORS restricted to configured frontend origins in production.
- Reviews require a **paid** booking owned by the logged-in user; public display only after **admin approval**.

---

## License

This project is provided for educational and portfolio use. Adjust licensing as needed for your repository.

---

## Author

**TourMatrix** — Melbourne-based travel agency demo / portfolio project.

Repository: [github.com/rijughosh01/TourMatrix](https://github.com/rijughosh01/TourMatrix)
