# Sketch Party 🎨

A real-time multiplayer drawing and guessing game.

## Planned MVP

- Create public rooms and private rooms with invite links
- Join as a player with a display name
- Choose a word and draw on a shared canvas
- Real-time drawing, chat guesses, and player presence
- Round timer, scoring, and leaderboard
- Responsive desktop and mobile layout

## Architecture

- **Frontend:** React + TypeScript + Vite
- **Realtime backend:** Supabase Realtime (Broadcast and Presence)
- **Persistence:** Supabase Postgres
- **Frontend hosting:** GitHub Pages

GitHub Pages hosts the static frontend. Supabase provides the realtime multiplayer backend and database.

## Status

Project initialized. MVP implementation is next.
