# Quizz

Local multiplayer quiz game:

- Players join on their phones (answer UI): `/`
- A projector screen shows the current question + leaderboard: `/projector`
- An admin screen drives the game (start/next/jump/remove players): `/admin`
- A convenient “everything on one monitor” layout for dev/demo: `/allviews`

Under the hood:

- Frontend: SvelteKit + Svelte 5 (runes) + Tailwind
- Realtime game state: PartyKit server in `party/server.ts`
- Question bank: `src/lib/assets/data.json`

This README is about *actually running the thing*.

## Quick start (local dev)

Prereqs: Node.js LTS.

1) Install dependencies:

```bash
npm install
```

2) Start the PartyKit realtime server (Terminal A):

```bash
npm run party:dev
```

3) Start the SvelteKit frontend (Terminal B):

```bash
npm run dev
```

4) Open the views:

- Player view: https://localhost:5173/
- Admin view: https://localhost:5173/admin
- Projector view: https://localhost:5173/projector
- All-in-one view: https://localhost:5173/allviews

Notes:

- The frontend is started with `--host 0.0.0.0` so phones on your LAN can open it.
- PartyKit dev runs on port `1999` by default in this project.
- When running the frontend on `https://` (needed for motion sensors), websockets are proxied through Vite so the browser connects via `wss://`.

## How to run an actual quiz (what to click)

1) Open the projector on the big screen: `/projector`.
2) Open the admin panel: `/admin`.
3) Players open the main page: `/`.
   - Pick a username.
   - Tap “Join”.
4) On the admin panel:
   - Click “Start Game”.
   - Use “Next Question / Phase” to advance.
   - Use “Finish round now” to end the timer early.
   - Jump directly to any question from the question list.

The normal flow is:

`lobby` → `question` → `review` → `question` → … → `finished`

Media questions (`type: "media"`) are “interludes” (no player answers).

## LAN play (phones join your dev machine)

1) Find your dev machine IP (example: `192.168.1.50`).
2) On each phone (same Wi‑Fi), open:

`http://192.168.1.50:5173/`

If you enabled HTTPS dev (default in this repo), use:

`https://192.168.1.50:5173/`

If players can load the page but don’t connect to realtime, set a PartyKit host override:

1) Create a `.env` file at the repo root:

```bash
VITE_PARTYKIT_HOST=192.168.1.50:1999
```

2) Restart `npm run dev`.

## Question bank / content

Questions come from:

- `src/lib/assets/data.json` (the PartyKit server imports this directly)

Static assets referenced by questions live in:

- `static/media/*` (videos/images for `media` questions)
- `static/fastfingers/*` (SVGs/etc used by `fastFingers` questions)

Implemented question types (see `src/lib/quiz/types.ts` and components under `src/lib/components/quiz/*/types/`):

- `qcm` (multiple choice)
- `sorting`
- `estimate`
- `fastFingers`
- `media`

## Rooms / sessions (current behavior)

Right now, the room id is hardcoded to `quiz-room-1` in the routes (player/admin/projector/allviews).

That means:

- Everyone who connects is in the same shared session.
- Running multiple independent quizzes at the same time is not supported yet.

## Useful scripts

- `npm run dev` — frontend dev server
- `npm run party:dev` — PartyKit dev server
- `npm run build` — production build
- `npm run preview` — preview built frontend
- `npm run check` — typecheck (SvelteKit sync + svelte-check)
- `npm run format` / `npm run lint` — prettier

## Deployment (high level)

There are two pieces to deploy:

1) The SvelteKit frontend (this repo)
2) The PartyKit server (`party/server.ts`)

The frontend connects to PartyKit using `VITE_PARTYKIT_HOST`. For production you typically set it to your deployed PartyKit host.

This repo currently uses `@sveltejs/adapter-auto` (see `svelte.config.js`), so pick a supported target (Vercel/Netlify/etc) or switch adapters as needed.

## Troubleshooting

### HTTPS dev (motion sensors) without certificate warnings

This repo runs `npm run dev` over HTTPS by default so motion sensors work.

- On your dev machine: the HTTPS certificate is generated via `vite-plugin-mkcert` and should be trusted automatically.
- On phones/tablets: you must install the mkcert *root CA* on the device to avoid warnings.

Mobile trust (summary):

1) On your dev machine, find the mkcert root CA location:

`npx mkcert -CAROOT`

2) Copy `rootCA.pem` to your phone.

3) iOS:
- Install the profile: Settings → “Profile Downloaded”
- Enable trust: Settings → General → About → Certificate Trust Settings → enable full trust

If you don’t install the CA on mobile, you can still proceed past the warning, but some browsers/features may behave differently.

- Projector/admin loads but stays disconnected: make sure `npm run party:dev` is running, and check `VITE_PARTYKIT_HOST`.
- Phones connect on localhost but not on LAN: open the site via your machine IP (not `localhost`) and/or set `VITE_PARTYKIT_HOST=<ip>:1999`.
- Editing `data.json` doesn’t change questions: restart `npm run party:dev` (PartyKit server imports the JSON at build time).

---

If you want, I can also:

- make the room id configurable via a URL param (so you can run multiple sessions), and update the README accordingly
- fix the projector “quiz-app.com” placeholder to display the actual join URL