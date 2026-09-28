# EnglishPod

A modern, interactive web application for learning English through EnglishPod transcripts.

## Features

- Browse and listen to EnglishPod episodes
- Interactive transcripts with synchronized audio playback
- Dark/Light theme support
- Responsive design for mobile and desktop
- Modern UI with smooth animations
- Optional Google sign-in that syncs vocabulary progress and the episode you are on across devices (API in [`server/`](server/README.md), reached at `/api` through a Vercel rewrite)

## Tech Stack

- React 19
- Vite
- Tailwind CSS
- Lucide React Icons

## Development

```bash
pnpm install
pnpm dev
```

For sign-in and sync, run the API too (see [`server/README.md`](server/README.md)) and set
`VITE_GOOGLE_CLIENT_ID` in `.env.local` (template: `.env.example`).

## Build

```bash
pnpm build
```
