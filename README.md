# gitCity

Turn a GitHub contribution history into a familiar 2D heatmap, then
transform it into a warm, daylight 3D skyline. Not affiliated with GitHub —
see [Assumptions](#assumptions) below.

## Stack

- Next.js (App Router) + TypeScript + React
- Tailwind CSS v4 (design tokens in [`src/app/globals.css`](src/app/globals.css),
  mirrored as hex constants in [`src/lib/theme/palette.ts`](src/lib/theme/palette.ts)
  for use in Three.js materials)
- React Three Fiber + Three.js for the 3D skyline
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

## How it behaves

There is only ever **one** visualization: the 3D scene. The "2D" state is
that same scene viewed from almost directly overhead. The camera is
orthographic in both states, and an orthographic top-down view of flat
tiles is pixel-identical to a flat grid of squares -- which is what lets a
single scene serve both, and why the transform reads as the chart lifting
rather than one view being swapped for another.

The camera sits ~2 degrees off vertical rather than at 0. At exactly
vertical its up vector parallels its view direction and `lookAt`
degenerates; 2 degrees foreshortens by ~0.06%, which is invisible.

**The bottom of the page holds one line throughout.** Idle, it is the
search field; searching drops it 8px and fades it out; loading shows
nothing at all; and once the data lands the identity pill, period picker
and download button fade in over it. They arrive at `INTRO_HOLD_MS` plus
half of `staggerTotalMs`, which puts them squarely mid-rise: earlier and
the chrome competes with a city that is still moving, later and it reads
as an afterthought. Both occupants are always mounted and absolutely
positioned, which is what lets them cross-fade — in flow, the outgoing
one would collapse the instant it left.

The line under it swaps the same way: four accounts worth looking at
while idle, the selected period's total once there is one. Two things
that never coexist, so they share a line rather than each reserving
their own.

**Changing the view.** A search holds the flat grid briefly and then
rises on its own, once per username. After that the only things that move
the camera is clicking the scene. There is no orbit, zoom, pan or lean:
the rig owns the camera outright, so it never has to be handed to
anything else and read back, and the only thing that answers the pointer
is the city itself, swelling underneath it.

The 2D/3D state is plain React state, not a URL param. Tapping the scene
is the primary interaction and fires repeatedly, and routing each toggle
through `router.replace` to flip one boolean was work for nothing. It
could not have been linked to either: a loaded city rises on its own, so
a shared `?view=2d` would never have reproduced the state it named. The
URL carries `user` and `period`, which are worth sending someone.

**Three distinct motions**, deliberately not sharing constants:

| Gesture | Motion |
| ------- | ------ |
| 2D to 3D | Sprung per building, staggered by column, with overshoot |
| 3D to 2D | Eased, uniform, no spring |
| Year change | Eased, uniform, no stagger |

A bounce during the transform reads as the city arriving. The same bounce
on a year change reads as the data being unstable, which is the wrong
thing for a chart to say.

**Height** is `sqrt(count / maxCount)` mapped onto a floor and the scene
maximum. Contribution data is heavily skewed -- one busy day sets the
ceiling -- so a linear scale would crush every ordinary day against the
floor. The square root lifts the low end enough that they still read as
buildings. Each period normalizes to its own maximum, so heights are not
comparable between periods; the accessible heatmap carries the exact
counts.

**Colour** comes from the same normalized value, interpolated in OKLCH
rather than sRGB, which would pass through muddy grey. The 2D heatmap
keeps GitHub's five discrete buckets for familiarity.

Green belongs to the data and to nothing else. There is deliberately no
accent colour in the palette: controls, focus rings, the FPS graph and
every other mark are neutral, so the only saturated thing on screen is
the city. Errors keep their own red, because a warning that blends in is
not a warning.

**The city swells under the pointer**, dock-style: buildings near the
cursor grow, with a Gaussian falloff so the swell has no visible edge.

It is measured along the **column axis only**, so a whole week lifts
together and the swell is a ridge spanning the grid's depth rather than a
dome on one tile. The two axes are not the same kind of thing — columns
are time, rows are weekday — and a radial falloff treats them as
interchangeable distances, claiming that three weeks away and three
weekdays away are comparable. They aren't: weekday is a category, not a
magnitude. Measuring on one axis also lets the radius stay meaningful
without the effect shrinking to a dot, and matches how the loading wave
measures the same space.

The exact counts live in the accessible heatmap, so the skyline is free
to exaggerate under the cursor without anyone losing the numbers.

The pointer is unprojected onto the ground plane and converted into the
mesh's own space, because the camera tilts and viewport coordinates say
nothing about which buildings are near. Damping the point rather than
each building keeps it to one lerp a frame, and the swell scales what is
written to the matrix rather than the spring state, so the physics never
learns about it.

It rises and settles on `easeInOutCubic` over 300ms — a duration rather
than exponential damping, which has no end and left the city decaying
back down for as long as anyone watched. Leaving is tracked separately
from moving: `pointerleave`, `pointercancel` and window `blur` all clear
an `inside` flag, because a pointer that has left the document keeps its
last coordinates and the swell would otherwise hold its bulge over an
empty screen forever.

**The loading wave lands rather than stops.** A free-running sine is at
an arbitrary phase whenever the data arrives, so half the columns would
be sitting at or near the deepest green — darker than almost any real
day — and the handover left that band to fade *downward*, which read as a
flash. The wave now outlives the search by `WAVE_SETTLE_MS`, decaying its
own amplitude to zero, so the grid is cream when the data starts painting
up into it.

**The idle city** is generated, not real. It is seeded so the server and
the first client render agree — the fixed seed is the server snapshot of
a `useSyncExternalStore` — and re-seeded per page load, so the city is a
different one each visit. About 95% of days are built on: an idle city
should read as a city, so the variety comes from height and colour rather
than from gaps.

## Mobile

The scene runs on phones and tablets, with a few deliberate differences:

- Pixel ratio is capped and shadows are off below 640px.
- The swell is disabled without a fine pointer. Touch devices fire
  `pointermove` during a tap and once more as the finger lifts, so the
  city would bulge and stay bulged with nothing following to settle it.
- Tapping the scene transforms it, with a wider movement allowance than a
  mouse gets: a finger wanders further over the same intent.
- The city is width-constrained in portrait, so it is allowed a much
  smaller margin than on desktop, where the chrome sits to the sides.
- The period picker is a dropdown, not a tab strip: five tabs are wider
  than a phone, and one button naming the current period is a fraction of
  that. It opens upward, because the controls are pinned to the bottom of
  the viewport and there is nothing below them but the edge of the
  screen.

Heights use `dvh` and padding uses `env(safe-area-inset-*)`, so iOS
Safari's address bar can't crop the page and the chrome clears the notch
and home indicator.

## Tuning panel

In development a gear button sits bottom-right, styled as the other round
controls on the page — and top-right on phones, where the bottom of the
screen belongs to the field and the controls. Every scene constant is a
live control there, grouped by concern, with per-section copy and reset. Copy a section, paste it over the matching block of
`DEFAULT_SCENE_CONFIG` in [`src/lib/three/config.ts`](src/lib/three/config.ts)
to make it the default. It is behind a `NODE_ENV` check, so none of it
reaches visitors.

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

## Verifying a build while `next dev` is running

`next build` and `next dev` share `.next`, so building while the dev
server is up overwrites its cache and it begins serving stale prerendered
HTML. That appears as a hydration mismatch: the server sends old markup,
the client renders new markup.

Build somewhere else instead:

```bash
NEXT_DIST_DIR=.next-verify pnpm build
```

If a hydration mismatch does appear, delete `.next` and restart the dev
server. It is only a cache.

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
  components/
    three/                        Canvas, camera rig, instanced buildings,
                                  parallax, labels, tuning panel, FPS meter
    *.tsx                         Search, period select, download,
                                  heatmap, profile, shell
  lib/
    api/                          Client-side fetch wrapper
    contributions/                Period/date/week math, height scale,
                                  scene tiles, public types
    github/                       GraphQL query, client, normalization,
                                  cache, throttle, offline fixtures
    hooks/                        Viewport size, media queries, WebGL support
    state/                        URL params, view mode, load phase
    theme/                        Colour palette and OKLCH interpolation
    three/                        Layout, camera, easing, springs, config
    username/                     Input parsing + reserved-name list
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
- Years GitHub reports but whose public calendar is empty keep their tab
  rather than being dropped, and say so in the scene. GitHub lists years
  it has *any* record for, including contributions that aren't publicly
  visible, so an empty tab is information rather than a bug.
- The current calendar-year tab is year-to-date and intentionally
  overlaps the rolling view.
- English-only copy, light/warm daylight theme only (no dark mode) for
  the MVP.
- PNG export is 1080x1350 (4:5 portrait at 2x), and is the city and an
  identity pill, nothing else. The frame is fixed rather than the
  viewport's shape, which would make the download read as a screenshot;
  the orthographic frustum is just a rectangle in pixels, so the export
  points it at its own size. The month and weekday labels are a DOM
  overlay rather than part of the scene, and are deliberately left out:
  what gets sent to someone is a picture of a city, not a chart. The
  wordmark sits at the top at 0.75x the identity pill's scale: whose city
  it is matters more than what made it. The button appears only in the 3D
  state, so there is no path to a "3D city" download that is really a
  flat grid.
- No social card builder, account system, analytics, or saved cities.
- The in-memory response cache and request throttle
  (`src/lib/github/cache.ts`, `src/lib/github/throttle.ts`) are
  best-effort, single-process — they work within one running server
  (and survive Next.js dev Fast Refresh) but don't share state across
  separate serverless function instances. Swap in Redis/Vercel KV if the
  deployment target needs cross-instance consistency.
- No animation library. Motion is hand-rolled in the R3F frame loop:
  a fixed-timestep spring integrator for the rise, and a CSS
  `cubic-bezier` evaluated in JS for everything eased, so scene motion and
  DOM motion share one curve. Framer Motion is DOM-only and its R3F
  bridge is deprecated; `@react-spring/three` would be the choice if a
  library were ever wanted.
- All buildings are a single instanced mesh, so the whole city is one
  draw call regardless of period length.

## Data attribution

Contribution data is fetched live from GitHub's GraphQL API. This
microsite is an independent project and is not affiliated with, endorsed
by, or sponsored by GitHub, Inc.
