# Render Deployment & Keep-Alive Guide

This guide explains how to deploy Nina to Render using your existing Turso Database.

---

## 1. Blueprint Configuration
A \ender.yaml\ file has been created in both the root folder and the \web\ folder. When you connect your GitHub repo, Render will automatically detect this Blueprint.

---

## 2. Environment Variables to Set on Render

Add these in your Render Web Service dashboard under **Environment**:

| Variable | Value | Notes |
| :--- | :--- | :--- |
| \TURSO_DATABASE_URL\ | \libsql://nina-db-nina-kurain.aws-ap-south-1.turso.io\ | Your existing Turso DB |
| \TURSO_AUTH_TOKEN\ | \your_turso_auth_token\ | From your Turso dashboard |
| \CREDENTIALS_KEY\ | \your_64_char_key\ | From your current .env |
| \NODE_VERSION\ | \22\ | Ensures Node 22 runtime |
| \NODE_OPTIONS\ | \--max-old-space-size=450\ | Prevents build memory spikes |

---

## 3. The 1-Line Cloudflare Switch (When Ready to Deploy)

Right now, your Cloudflare configuration is completely untouched so you can continue using it.

When you are ready to deploy to Render:
1. In \web/lib/server.ts\ (line 6) and \web/db/index.ts\ (line 1), change:
   \\\	s
   // FROM:
   import { env } from 'cloudflare:workers';

   // TO:
   const env = (globalThis as any).__CLOUDFLARE_ENV__ || (typeof process !== 'undefined' ? process.env : {}) || {};
   \\\
2. In \web/package.json\, make sure your build & start scripts run Next.js:
   \\\json
   "scripts": {
     "dev": "next dev",
     "build": "next build",
     "start": "next start"
   }
   \\\

---

## 4. Setting up the 24/7 Keep-Alive & Queue Trigger

To keep Render awake 24/7 and run scheduled Instagram replies:
1. Go to [cron-job.org](https://cron-job.org) (Free).
2. Create a new Cron Job:
   - **URL:** \https://<your-render-subdomain>.onrender.com/api/process\
   - **Method:** \POST\
   - **Schedule:** Every 1 minute or 2 minutes
   - **Headers:**
     - \x-nina-client\: \1\
     - \origin\: \https://<your-render-subdomain>.onrender.com\
   - **Body:** \{}\

This ping keeps your single free service running non-stop without sleeping and processes all pending Instagram queue jobs.
