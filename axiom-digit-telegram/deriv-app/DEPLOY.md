# Deploying Axiom Digit Trader

## Step 1 — Get a Gemini API Key (Free)
1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key

## Step 2 — Deploy to Render.com (Free)

1. **Push to GitHub:**
   - Create a new repo on github.com
   - Run: `git init && git add . && git commit -m "init" && git remote add origin <your-repo-url> && git push -u origin main`

2. **Deploy on Render:**
   - Go to https://render.com and sign in (free account)
   - Click "New → Web Service"
   - Connect your GitHub repo
   - Render auto-detects the `render.yaml` — just click **Deploy**
   - Go to **Environment** and add: `GEMINI_API_KEY = <your key>`

3. **Access on your phone:**
   - Once deployed, Render gives you a URL like `https://axiom-digit-trader.onrender.com`
   - Open that URL in Chrome on your Android
   - Tap the 3-dot menu → **"Add to Home Screen"**
   - The app installs like a native app! ✅

## Local Development
```bash
cp .env.example .env.local
# Add your GEMINI_API_KEY in .env.local
npm install
npm run dev
# Open http://localhost:3000
```
