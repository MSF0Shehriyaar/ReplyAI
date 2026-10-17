# Render Deployment & Cloudflare DNS Tunnel Guide

This guide explains how to run **ReplyAI** on **Render** as your main application host, while using **Cloudflare** as the edge proxy/tunnel for your custom domain `automation.ninakurainservices.in`.

---

## Architecture Overview

```
Visitor / Instagram Webhooks
             │
             ▼
Cloudflare Edge Proxy (Tunnel / DNS CNAME)
  • Domain: automation.ninakurainservices.in
  • Orange Cloud: Proxied (DDoS protection, SSL termination)
             │
             ▼
Render Web Service (Main Node.js Server)
  • Host: https://replyai.onrender.com (or your Render service URL)
  • Runtime: Node 22 (Full Next.js server runtime)
  • Database: Turso SQLite Cloud
```

---

## Step 1: Deploy on Render

1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** ➔ **Web Service** (or **Blueprint**).
3. Connect your GitHub repository:
   - `https://github.com/MSF0Shehriyaar/ReplyAI`
4. If using manual Web Service creation:
   - **Name**: `replyai`
   - **Region**: Singapore (or closest to your users)
   - **Branch**: `main`
   - **Root Directory**: `web`
   - **Runtime**: `Node`
   - **Build Command**: `pnpm install && pnpm run build`
   - **Start Command**: `pnpm run start`
   - **Plan**: Free

---

## Step 2: Set Environment Variables on Render

In your Render dashboard under **Environment**, add the following variables:

| Variable | Value / Source | Description |
| :--- | :--- | :--- |
| `NODE_VERSION` | `22` | Node runtime version |
| `NODE_OPTIONS` | `--max-old-space-size=450` | Prevents build memory spikes |
| `NEXT_TELEMETRY_DISABLED` | `1` | Disables telemetry |
| `TURSO_DATABASE_URL` | `libsql://nina-db-nina-kurain.aws-ap-south-1.turso.io` | Your Turso DB URL |
| `TURSO_AUTH_TOKEN` | *(From your Turso Dashboard / .env)* | Database auth token |
| `CREDENTIALS_KEY` | *(From your .env)* | 64-character encryption key |
| `NEXT_PUBLIC_APP_URL` | `https://automation.ninakurainservices.in` | Custom domain URL |

---

## Step 3: Add Custom Domain in Render

1. In your Render Web Service dashboard, go to **Settings** ➔ **Custom Domains**.
2. Click **Add Custom Domain** and enter:
   ```
   automation.ninakurainservices.in
   ```
3. Render will display instructions to create a CNAME record pointing to:
   ```
   replyai.onrender.com
   ```
   *(or your specific Render service subdomain)*

---

## Step 4: Configure Cloudflare as the Tunnel / Proxy

1. Open your [Cloudflare Dashboard](https://dash.cloudflare.com) and select the `ninakurainservices.in` zone.
2. If `automation.ninakurainservices.in` is currently attached to a Cloudflare Worker:
   - Go to **Workers & Pages** ➔ select your worker (`nina-automation`) ➔ **Settings** ➔ **Domains & Routes**.
   - Remove or detach `automation.ninakurainservices.in` from the worker custom domains so DNS can route directly to Render.
3. Go to **DNS** ➔ **Records**:
   - Click **Add record** (or edit existing `automation` record):
     - **Type**: `CNAME`
     - **Name**: `automation`
     - **Target**: `<your-service-name>.onrender.com` (from Step 3)
     - **Proxy status**: **Proxied (Orange Cloud)** ☁️ *(This acts as the secure tunnel and CDN)*
     - **TTL**: `Auto`
4. Go to **SSL/TLS** in Cloudflare:
   - Ensure encryption mode is set to **Full** or **Full (strict)** so Cloudflare can securely communicate with Render's SSL certificate.

---

## Step 5: 24/7 Keep-Alive & Background Queue Processing

Since Render Free tier spins down after 15 minutes of inactivity, ReplyAI includes two built-in mechanisms:

1. **Automatic Self-Ping (`web/instrumentation.ts`)**:
   - The server automatically pings itself every 10 minutes to stay awake and processes pending queue jobs every 30 seconds.
2. **External Free Cron Ping (Recommended for 100% Reliability)**:
   - Go to [cron-job.org](https://cron-job.org) (Free).
   - Create a recurring job every **2 minutes**:
     - **URL**: `https://automation.ninakurainservices.in/api/process`
     - **Method**: `POST`
     - **Headers**:
       - `x-nina-client`: `1`
       - `origin`: `https://automation.ninakurainservices.in`
     - **Body**: `{}`

This guarantees 24/7 non-stop execution, instant webhook handling, and real-time social engagement.
