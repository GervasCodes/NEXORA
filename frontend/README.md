# NEXORA Frontend (Buyer Storefront)

React + Vite + Tailwind CSS.

## Setup

```
cd frontend
npm install
cp .env.example .env
```

Edit `.env` if your backend isn't running on `http://localhost:5000`.

## Run

```
npm run dev
```

Opens at `http://localhost:5173`. Make sure the backend (`cd ../backend && npm run dev`) is running too.

## What's here

Buyer-facing storefront only, per the current build phase:

- `/` — product grid, search, category filter
- `/products/:slug` — product detail, gallery, add to cart, reviews
- `/login`, `/register`
- `/cart` — buyer only
- `/checkout` — shipping + payment method, places the order
- `/orders`, `/orders/:id` — order history, cancel, retry Mobile Money payment

Seller dashboard, delivery agent app, and admin panel are not built yet — those are separate frontends/sections for a future pass.

## Notes

- Auth token is stored in `localStorage` (`nexora_token`) — fine for a real app like this, unlike sandboxed artifacts.
- The cart badge and buyer-only routes rely on `AuthContext` + `CartContext` in `src/context/`.
- Money is formatted as TZS; change `src/utils/format.js` if you're targeting a different currency.
- Chat and real-time notifications (Socket.IO) aren't wired into this storefront yet — the backend supports them, but no UI consumes them here yet.
