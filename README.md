# Wordbook – Web (English_FE)

React + Vite + TypeScript web app for Wordbook, a vocabulary app for IT work, interviews and meetings.
It talks to the NestJS API in [English_BE](https://github.com/minhtrungs013/English_BE); the mobile app
([English_MB](https://github.com/minhtrungs013/English_MB)) uses the same API and data.

## Run

```bash
npm install
cp .env.example .env   # set VITE_API_URL if the API isn't on http://localhost:3000/api
npm run dev            # http://localhost:5173
```

Start the API first (`npm run start:dev` in English_BE).

## Features

- Log in / sign up; every user's words are private to them.
- Dashboard, My Vocabulary (search, filters), add/edit words with dictionary auto-fill.
- Shared **Vocabulary Library** (500 built-in words + words shared by users): search, save to my words, share my own words.
- Flashcard review with spaced repetition, and practice (multiple choice, fill in the blank, translation, listening).
- Settings: learning preferences, light/dark theme, 6 accent colors, pronunciation voice/speed/pitch.

## Structure

- `src/pages/` — screens; `src/sessions/` — review and practice sessions.
- `src/state/WordbookContext.tsx` — app state and actions.
- `src/lib/` — API client, shared types/helpers, icons, speech.
- `src/styles.css` — the design's styles (from the Wordbook design artifact) plus library, auth and accent additions.
