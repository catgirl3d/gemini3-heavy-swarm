# 🔐 "Secret Handshake" System (X-API-Secret)

This project implements a "Secret Handshake" (anti-abuse measure) for API endpoints. It requires both the client (browser) and the server (Cloudflare/Express/Cloud Run) to possess an identical secret key to authorize requests.

> [!IMPORTANT]
> **Anti-Abuse, Not full Auth:** 
> `VITE_API_SECRET` is bundled into the frontend and is **visible in the browser's Network tab**. This system is designed to prevent **direct API abuse** by third-party scripts and automated bots, but it is **not a full-blown security/authentication solution** against a dedicated user.

## 🚀 How It Works

1. **Client-Side (Frontend):**
   - The handshake is initiated in `ProxyGenerativeModel.generateContentStream()` (`services/ProxyGenAI.ts`).
   - Every request to `/api/gemini` includes the `X-API-Secret` header.
   - Vite injects the `VITE_API_SECRET` during the build process.

2. **Server-Side (Backend):**
   - **Express (`server.js`)**: An inline middleware validates the header for all `/api/` POST requests.
   - **Cloudflare Functions**: The `validateSecretHeader()` function in `functions/_security.ts` (called by `functions/api/gemini.ts`) performs the validation.

3. **Outcome:**
   - If keys **match** — the request is proxied to the Google Gemini API.
   - If keys **mismatch or are missing** — the server returns a `403 Forbidden` error.

## 🛠 Configuration

To enable this system, you must configure the secrets in all deployment environments. **The keys in your `.env` files and cloud settings must be identical.**

### 1. Local Development (`.env.local`)

Add the following lines to your file:

```bash
# For the backend (server.js)
API_SECRET=your_complex_secret_here

# For the frontend (Vite)
VITE_API_SECRET=your_complex_secret_here
```

### 2. Cloudflare Pages

In the Cloudflare Dashboard (**Settings -> Functions -> Environment variables**):

- Add a variable named `API_SECRET` with your secret value.

### 3. Google Cloud Run (Docker)

In your container settings (or Dockerfile):

- Add the `API_SECRET` environment variable.

---

## ⚠️ Security Best Practices

- **Never hardcode secrets.** We use `import.meta.env.VITE_API_SECRET` and `process.env.API_SECRET` for dynamic injection.
- **Environment Separation.** Use different secrets for local development and production environments.
- **Header Visibility.** As mentioned, the browser **sees** the secret in the Network tab. This measure protects against automated bots and direct API abuse, but it is not a 100% defense against focused manual reverse-engineering.

## 🔄 Rotating Keys

To rotate your key, simply update the environment variables on the server and rebuild/redeploy the frontend with the new `VITE_API_SECRET`.

---

## 🚦 Rate Limiting

The backend (both `server.js` and Cloudflare Functions) implements a rate limiting system to prevent abuse and manage costs.

### 🛡️ Implementation Details

- **Targeted Protection:** Rate limiting is **only applied** to the model generation endpoint (`POST /api/gemini`).
- **Excluded Requests:** Static files (HTML/JS/CSS), CORS preflight (`OPTIONS`), and health checks (`/api/status`) are **not** rate-limited to ensure smooth application loading.
- **Limit:** Defined by `RATE_LIMIT_PER_MINUTE` in `constants/security.js`.
- **Behavior:** If the limit is exceeded, the server returns a `429 Too Many Requests` error.
