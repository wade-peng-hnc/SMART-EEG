# SMART Confidential Client Proxy Setup

Use this setup when your SMART app must use a confidential `client_secret` safely.

## Why

- Never place `client_secret` in frontend code (`launch.html`, `App.jsx`).
- The proxy exchanges OAuth code on server side and returns a short-lived session to frontend.

## 1) Prepare environment

1. Copy `.env.smart-proxy.example` to `.env.local`.
2. Fill in:
   - `SMART_CLIENT_ID`
   - `SMART_CLIENT_SECRET`
   - `SMART_PROXY_BASE_URL` (e.g. `http://localhost:8787`)
   - `SMART_FRONTEND_REDIRECT_URI` (e.g. `http://localhost:5173/`)
3. Keep `VITE_SMART_PROXY_ENABLED=true` and `VITE_SMART_PROXY_BASE_URL=http://localhost:8787`.

## 2) Start app

In two terminals:

1. `npm run dev:proxy`
2. `npm run dev`

## 3) Launcher settings

When using confidential mode, set launcher values:

- Launch URL: `http://localhost:8787/smart/launch`
- Redirect URI: `http://localhost:8787/smart/callback`
- Scope: `launch openid fhirUser profile patient/*.read`

Frontend app URL stays `http://localhost:5173/`.

## Notes

- This proxy is intended for local/internal testing.
- For production, deploy the proxy to a secure backend host and update launcher URLs accordingly.
