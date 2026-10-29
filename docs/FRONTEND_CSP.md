# Frontend CSP (Render Static Site -> Settings -> Headers)

Set ONE `Content-Security-Policy` header for path `/*`. Replace the two
`api.nexoramarketplace.online` entries if your API/Socket.IO origin differs
(check `VITE_API_URL` / `VITE_SOCKET_URL`).

```
default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client https://www.googletagmanager.com; connect-src 'self' https://api.nexoramarketplace.online wss://api.nexoramarketplace.online https://res.cloudinary.com https://nominatim.openstreetmap.org https://accounts.google.com https://*.ingest.sentry.io https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; img-src 'self' data: blob: https://res.cloudinary.com https://*.tile.openstreetmap.org https://unpkg.com https://images.unsplash.com https://*.google-analytics.com https://*.googletagmanager.com; media-src 'self' blob: https://res.cloudinary.com; font-src 'self' data:; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; frame-src https://accounts.google.com https://www.youtube.com; object-src 'none'; base-uri 'self'; form-action 'self'
```

Why each addition (these were the blocked items in the browser console):
- `connect-src https://res.cloudinary.com` - not strictly needed any more
  (sw.js no longer re-fetches images) but harmless and safe if you re-add caching.
- `script-src https://www.googletagmanager.com` - Google Analytics script.
- `connect-src` api/wss - the dashboard, socket and shift toggle need this.
