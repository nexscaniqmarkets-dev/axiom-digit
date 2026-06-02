# Axiom Digit Trader — Telegram Mini App

Automated Deriv Digit Match bot, running as a Telegram Mini App.

---

## 🚀 Full Setup Guide

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "feat: initial Axiom Digit Telegram Mini App"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/axiom-digit.git
git push -u origin main
```

---

### Step 2 — Deploy backend to Render.com

1. Go to [render.com](https://render.com) → sign up free → **New → Web Service**
2. Connect your GitHub repo
3. Render auto-detects `render.yaml` — click **Deploy**
4. Go to **Environment** tab and add:
   - `GEMINI_API_KEY` = your key from [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
5. Wait for deploy → copy your Render URL (e.g. `https://axiom-digit.onrender.com`)

---

### Step 3 — Set up GitHub Actions auto-deploy

So every `git push` auto-deploys:

1. In Render → your service → **Settings** → scroll to **Deploy Hook** → copy the URL
2. In your GitHub repo → **Settings → Secrets and variables → Actions**
3. Click **New repository secret**:
   - Name: `RENDER_DEPLOY_HOOK`
   - Value: paste the Render deploy hook URL
4. Now every push to `main` triggers a build + deploy automatically ✅

---

### Step 4 — Create Telegram Bot + Mini App

1. Open Telegram → search **@BotFather** → `/start`
2. Send `/newbot` → follow prompts → copy your **bot token**
3. Send `/newapp` → select your bot → follow prompts:
   - **Title:** Axiom Digit
   - **Description:** Automated Deriv Digit Match trading bot
   - **Web App URL:** `https://axiom-digit.onrender.com` ← your Render URL
   - Upload an icon (512×512 PNG)
4. BotFather gives you a **Mini App URL** like `https://t.me/YourBot/axiomdigit`

Share that link and users can open the app directly inside Telegram! 🎉

---

### Step 5 — Configure the app

Inside the Mini App:
- Go to **Profile Settings**
- Enter your **Deriv App ID** (from [app.deriv.com/account/api-token](https://app.deriv.com/account/api-token))
- Enter your **Deriv API Token**
- Start in **Simulation Mode** first to test

---

## Local Development

```bash
cp .env.example .env.local
# Fill in GEMINI_API_KEY in .env.local
npm install
npm run dev
# Open http://localhost:3000
```

## Tech Stack
- React 19 + TypeScript + Tailwind CSS v4
- Express + WebSocket server (Node.js)
- Telegram Mini App SDK
- Deriv WebSocket API
- Google Gemini AI
