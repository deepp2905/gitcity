# Contribution City

Turn a GitHub contribution history into a familiar 2D heatmap, then
transform it into a warm, daylight 3D skyline. Not affiliated with GitHub —
see [Assumptions](#assumptions) below.

## Stack

- Next.js (App Router) + TypeScript + React
- Tailwind CSS v4 (design tokens in [`src/app/globals.css`](src/app/globals.css),
  mirrored as hex constants in [`src/lib/theme/palette.ts`](src/lib/theme/palette.ts)
  for use in Three.js materials)
- React Three Fiber + Drei + Three.js for the 3D skyline
- Vitest for unit tests (pure logic only — see [Testing](#testing))
- pnpm

## Getting started

```bash
pnpm install
cp .env.example .env.local
```

Then add a GitHub personal access token to `.env.local` as `GITHUB_TOKEN`
(see the comments in `.env.example` for how to create one — no special
scopes are required to read public profile/contribution data). This token
is read server-only in `src/lib/github/client.ts` and is never sent to the
browser.

```bash
pnpm dev
```

## Pinned dependency

`three` is pinned to **0.182.0**, the last release before r183 deprecated
`THREE.Clock`. React Three Fiber 9.7.0 still constructs a `Clock`
internally, so any newer three prints a deprecation warning on every
page load that no application code can silence.

Unpin this (back to `^0.185` or later) once R3F migrates to `THREE.Timer`.

## Offline development

Set `USE_FIXTURES=true` in `.env.local` and the API route serves saved
responses from [`fixtures/`](fixtures) instead of calling GitHub — no
token needed, no rate limit consumed, and identical response shapes
because the fixtures are captured normalized responses. A username with
no matching `fixtures/<name>.json` returns `NOT_FOUND`.

`fixtures/` is gitignored — fixtures are local-only, never committed.
Capture your own with the flag unset (so the request hits the live API):

```bash
curl "http://localhost:3000/api/contributions?user=NAME" > fixtures/NAME.json
```

Worth capturing at least one sparse account alongside a dense one: a
profile with an entirely empty calendar year exercises the `maxCount`
of 0 path in the height scale, which a busy graph never reaches.

## Scripts

| Command              | Description                              |
| --------------------- | ----------------------------------------- |
| `pnpm dev`             | Start the dev server                      |
| `pnpm build`           | Production build                          |
| `pnpm start`           | Run the production build                  |
| `pnpm lint`            | ESLint                                    |
| `pnpm test`            | Run unit tests once                       |
| `pnpm test:watch`      | Run unit tests in watch mode              |
| `pnpm test:coverage`   | Run unit tests with coverage              |

## Testing

By design, this project ships **unit tests only**, covering pure logic
that a manual browser pass won't reliably exercise: username parsing
(`src/lib/username`), contribution period/date/week math and the
sqrt height-normalization curve (`src/lib/contributions`). UI behavior —
the heatmap, the 3D scene, transitions, accessibility — is verified
manually in the browser rather than through component or E2E tests.

## Project structure

```
src/
  app/
    api/contributions/route.ts   GET /api/contributions?user=...
    page.tsx, layout.tsx, globals.css
  lib/
    contributions/                Period/date/week math, height scale, public types
    github/                       GraphQL query, client, normalization, cache, throttle
    username/                     Input parsing + reserved-name list
    theme/                        Shared color palette (CSS <-> Three.js)
```

## Assumptions

- GitHub.com public profiles only; GitHub Enterprise and user OAuth are
  out of scope.
- "Five tabs" means Last 12 months plus up to four calendar years. The
  GraphQL query always requests the current year and the three years
  before it (GraphQL aliases must be static); which of those become
  visible tabs is then decided by which years GitHub actually reports
  contribution history for. An account whose most recent activity is
  older than that four-year window won't show a tab for it — a
  deliberate MVP trade-off over doing a two-step "discover years, then
  query" round trip.
  Please push back before we ship this if it feels wrong.
- The current calendar-year tab is year-to-date and intentionally
  overlaps the rolling view.
- English-only copy, light/warm daylight theme only (no dark mode) for
  the MVP.
- No export, screenshot generator, social card builder, account system,
  analytics, or saved cities.
- The in-memory response cache and request throttle
  (`src/lib/github/cache.ts`, `src/lib/github/throttle.ts`) are
  best-effort, single-process — they work within one running server
  (and survive Next.js dev Fast Refresh) but don't share state across
  separate serverless function instances. Swap in Redis/Vercel KV if the
  deployment target needs cross-instance consistency.
- No general animation library — 3D motion uses local
  frame-loop damping (R3F/Drei) rather than e.g. Framer Motion/GSAP.

## Data attribution

Contribution data is fetched live from GitHub's GraphQL API. This
microsite is an independent project and is not affiliated with, endorsed
by, or sponsored by GitHub, Inc.
