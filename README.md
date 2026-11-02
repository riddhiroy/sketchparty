# Sketch Party 🎨

A real-time multiplayer drawing and guessing game.

**Live app:** https://riddhiroy.github.io/sketchparty/ (after GitHub Pages is enabled and the first deployment succeeds).

## What's in the MVP

- Create a room and invite friends with a shareable room link
- Join an existing room with its code
- Live player presence and shared drawing canvas
- Word choices for the artist, live guesses, round timer, and scoring
- Responsive desktop and mobile layout
- Demo mode when multiplayer credentials have not been configured

## Stack

- React + TypeScript + Vite
- Supabase Realtime Broadcast and Presence for multiplayer
- GitHub Actions + GitHub Pages for frontend hosting

GitHub Pages serves the static frontend. Supabase provides the realtime multiplayer service; GitHub Pages cannot run a persistent WebSocket server itself.

## Configure multiplayer

1. Create a free project at https://supabase.com/dashboard.
2. In the Supabase project, open **Project Settings → API**.
3. Copy the **Project URL** and the **anon / publishable key**. Never use the service-role key in a browser app.
4. In this GitHub repository, open **Settings → Secrets and variables → Actions → Variables**.
5. Add these repository variables:
   - VITE_SUPABASE_URL = your Supabase Project URL
   - VITE_SUPABASE_ANON_KEY = your Supabase anon / publishable key

The app uses public Supabase Realtime channels for room events. Keep the anon key public and never put a service-role key in frontend code or GitHub Actions variables.

## Enable GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. The workflow at .github/workflows/deploy.yml builds and deploys the app whenever code is pushed to main.
4. Open the **Actions** tab and wait for **Deploy Sketch Party to GitHub Pages** to complete.

The first deployment may take a few minutes. The site URL is https://riddhiroy.github.io/sketchparty/.

## Run locally

```bash
npm install
npm run dev
```

Create a .env.local file with the two Vite variables above to enable realtime multiplayer locally. Without them, the app opens in demo mode.

## Current MVP limitations

- The room's first player is the artist for the round; turn rotation and full multi-round match flow are next.
- The current realtime room state is transient. A room is active while players are connected.
- Supabase project setup and GitHub Pages enablement are one-time manual steps.
