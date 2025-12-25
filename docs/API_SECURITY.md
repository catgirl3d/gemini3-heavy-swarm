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
- **Proxy Support:** The Express server uses `trust proxy: true` to correctly identify client IPs when running behind reverse proxies (Cloud Run Load Balancer, nginx, Cloudflare). Without this, all requests would appear to come from the proxy's IP, breaking per-user rate limiting.

---

## 🛡️ Security Headers

The Express server (`server.js`) applies several security headers to protect against common web vulnerabilities.

### 📋 Applied Headers

#### Always Applied (All Responses)

- **`X-Content-Type-Options: nosniff`**  
  Prevents MIME-type sniffing attacks by forcing browsers to respect the declared `Content-Type`.

- **`X-Frame-Options: DENY`**  
  Prevents clickjacking attacks by disallowing the page from being embedded in `<iframe>`, `<frame>`, or `<object>` elements.

#### API Endpoints Only (`/api/*`)

- **`Content-Security-Policy: default-src 'none'; frame-ancestors 'none';`**  
  Enforces a strict CSP that blocks all resource loading for API responses. This is appropriate for JSON endpoints that should never load scripts, styles, or other assets.
  
  > [!IMPORTANT]  
  > **Why only `/api/*`?**  
  > Applying `default-src 'none'` globally would **break the frontend** by blocking all JavaScript, CSS, and images. The UI routes (`/`, `index.html`, static assets) need to load resources normally, so CSP is intentionally scoped to API endpoints only.

#### Production Only (Auto-Detected)

- **`Strict-Transport-Security: max-age=31536000; includeSubDomains`**  
  Forces browsers to use HTTPS for all future requests for 1 year. This header is:
  - **Automatically enabled** when requests come from production domains (Cloudflare Pages, custom domains)
  - **Automatically disabled** in local development (where `http://localhost` is used)
  
  > [!NOTE]  
  > **Automatic Detection:**  
  > Production environment is auto-detected based on request origin/hostname. No need to manually set `NODE_ENV`!
  > 
  > Production domains are defined in `PRODUCTION_ORIGINS` in `constants/security.js`:
  > - `https://gemini3-heavy-swarm.pages.dev`
  > - `https://ai-swarm.lisova-minds.pro`
  
  > [!WARNING]  
  > **Why not in development?**  
  > On `http://` connections, browsers ignore HSTS. However, if you use an HTTPS tunnel (ngrok, Cloudflare Tunnel) during development, the header would "stick" for a year, potentially causing issues. To avoid confusion and accidental HSTS pinning, it's only applied when requests come from production domains.
