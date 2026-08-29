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

The wordmark leaves upward while a search runs, as the field leaves
downward — the chrome retreats to the edges and the city has the screen
to itself. Opacity, not `display`, so the header keeps its height and
nothing below it moves.

Note for anyone editing these: Tailwind v4 compiles `translate-*` to the
standalone `translate` property, not `transform`, so a transition must
name `translate` or the movement snaps and only the fade animates.

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

Month and weekday labels never appear over the loading wave. The camera
is flat throughout a search, so they would otherwise sit there dating a
chart that is showing an animation rather than anyone's year; they arrive
with the data instead.

**A failed search returns to idle** — the mock city, the field, and the
error above it. It used to leave whatever city was already loaded
standing, which made sense while the field was always on screen beside
it. Once the field hands over to the controls in the ready phase, that
resurrected the previous user's city, gave it their controls, and left
the error naming someone nothing on screen belonged to, with no field
left to try again in.

**Both kinds of failure share one line**, just above the field — bare
text, not a bordered banner: a box announces itself before it is read,
and this sits beside a search field where being wrong is routine. A malformed username never leaves
the browser and a missing account comes back from the API, but they are
the same news to whoever typed it, so validation
lives in `CityApp` alongside the fetch error rather than inside the form.
A local complaint outranks a lookup error: it describes what is in the
field now, where the other describes the last thing submitted.

**Changing the view.** A search holds the flat grid briefly and then
rises on its own, once per search. After that the only thing that moves
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

The swell answers the pointer across the whole page, since the city
fills the viewport behind everything — but not while it is over the
chrome. Hovering a button, the field or the open menu settles it rather
than driving it, so the chart is not heaving underneath whatever is being
read; moving back off picks it up again. Native interactive tags and a
couple of ARIA roles cover most of that, with `data-ui` for panels that
are plain containers.

The pointer is unprojected onto the ground plane and converted into the
mesh's own space, because the camera tilts and viewport coordinates say
nothing about which buildings are near. Damping the point rather than
each building keeps it to one lerp a frame, and the swell scales what is
written to the matrix rather than the spring state, so the physics never
learns about it.

That last part has one consequence worth knowing: the swelled height
exists only in the matrix, so anything that reads `heights` sees the true
height. The flatten therefore has to bake the swell into its starting
snapshot, or a raised building drops to its real height on the first
frame and eases down from there. The year morph carries the swell for the
same reason — the city is standing throughout, so a bulge should survive
it rather than collapse and come back.

It rises and settles on `easeInOutCubic` over 300ms — a duration rather
than exponential damping, which has no end and left the city decaying
back down for as long as anyone watched. Leaving is tracked separately
from moving: `pointerleave`, `pointercancel` and window `blur` all clear
an `inside` flag, because a pointer that has left the document keeps its
last coordinates and the swell would otherwise hold its bulge over an
empty screen forever.

**The loading wave steps between five colours** rather than interpolating
between them. The contribution ramp is continuous because it encodes a
magnitude; the wave encodes nothing, so stepping suits it. It is a
triangle rather than a sine for the same reason — a sine lingers near its
extremes, so with five bands roughly 60% of every cycle would sit on the
two ends and the three between them would flicker past.

Its steps are **sampled from the contribution ramp**, not taken from
GitHub's five swatches. Those swatches do not sit on a straight line:
they bow outward in chroma, peaking at 0.178 for `#40c463`, where the
ramp runs flat at ~0.112-0.119 end to end. Stepping through them put
colours on screen half again as saturated as anything the city itself can
render, and with ambient 1.6 plus directional 2 the extra chroma is what
clips first — so those steps read as neon while the same lighting left
the city alone.

**And it lands rather than stops.** A free-running wave is at an
arbitrary phase whenever the data arrives, so a good share of the columns
would be sitting on the deepest green — darker than almost any real day —
and the handover left that band to fade *downward*, which read as a
flash. The wave now outlives the search by `WAVE_SETTLE_MS`, and over
that window each tile crosses from its wave colour straight to its own
data colour, while the wave itself keeps running: the chart resolves in
motion rather than freezing and then fading.

Per tile, deliberately. Decaying the wave's amplitude to zero instead was
smooth, but it took the whole grid to cream on the way, and a chart that
blanks before it fills reads as a second load rather than the end of the
first.

**The idle city** is generated, not real. It is seeded so the server and
the first client render agree — the fixed seed is the server snapshot of
a `useSyncExternalStore` — and re-seeded per page load, so the city is a
different one each visit. About 95% of days are built on: an idle city
should read as a city, so the variety comes from height and colour rather
than from gaps.

## Mobile

The scene runs on phones and tablets, with a few deliberate differences:

- Pixel ratio is capped and shadows are off below 640px.
- The identity pill drops its username and becomes a bare avatar, and the
  suggested-account row drops its fourth name. Three controls plus a
  variable-width username do not fit a narrow row, and a second line
  would push it into the city.
- Month and weekday labels drop to 10px with tighter offsets. The grid is
  width-constrained on a phone, so a month occupies about 24px of screen
  and 12px type runs the labels into one another; the weekday gutter is a
  fixed 34px, which 12px type filled exactly.
- A finger drives the swell the way a cursor does, but only while it is
  down. There is no hovering touch, so a tap that ended must not leave
  the bulge where it landed. Touch pointers only emit `pointermove` while
  in contact, so a drag is already scoped to the gesture; only the lift
  needs handling. A drag scrubs the swell and a tap transforms the view,
  which the 14px movement threshold below keeps apart.
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

A **Debug: loading wave** group sits at the bottom of the panel. "Hold
loading state" pins the flat camera and the wave on regardless of what
the app is doing, so the three treatments below it can be watched for as
long as it takes to judge them, and switched on in any combination:

| Toggle | What it changes |
| ------ | --------------- |
| Diagonal front | Phase offset per weekday, so the front leans instead of running as vertical bars |
| Sharp front | Fast leading edge, long tail — direction becomes legible, where a symmetric triangle reads as pulsing in place |
| Pulse scale | Tiles shrink between crests and swell through them. Footprint, not height: height is invisible from straight above, which is why the wave is colour-driven in the first place |

Pulse scale follows the raw wave value rather than the stepped colour, so
snapping colour plays against smooth breathing, and it eases back to a
full cell through the settle so the data never lands on shrunken tiles.

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

By design, this project ships **unit tests only**, covering pure logic a
manual browser pass won't reliably exercise:

- username parsing and the reserved-name list (`src/lib/username`)
- period/date/week math, the sqrt height curve, month-label placement and
  the seeded mock city (`src/lib/contributions`)
- the load-phase state machine and URL round-tripping (`src/lib/state`)
- camera fitting, the cubic-bezier solver, the spring integrator, grid
  layout, rounded-box geometry and the loading wave (`src/lib/three`)
- OKLCH interpolation and the wave's colour steps (`src/lib/theme`)
- export filenames and frame geometry (`src/lib/export`)

UI behaviour — the scene, transitions, layout, accessibility — is
verified manually in the browser rather than through component or E2E
tests.

## Project structure

```
src/
  app/
    api/contributions/route.ts   GET /api/contributions?user=...
    page.tsx, layout.tsx, globals.css
  components/
    three/                        Canvas, camera rig, instanced buildings,
                                  labels, shadow catcher, tuning panel,
                                  FPS meter
    *.tsx                         Search, suggested logins, period select,
                                  download, heatmap, profile, shell
  lib/
    api/                          Client-side fetch wrapper
    export/                       PNG composition for the download
    contributions/                Period/date/week math, height scale,
                                  scene tiles, mock city, empty-year copy,
                                  public types
    github/                       GraphQL query, client, normalization,
                                  cache, throttle, offline fixtures
    hooks/                        Viewport size, media queries, WebGL
                                  support, per-visit mock seed
    state/                        URL params, view mode, load phase
    theme/                        Colour palette and OKLCH interpolation
    three/                        Layout, camera, easing, springs, loading
                                  wave, building geometry, config
    username/                     Input parsing + reserved-name list
```

## Assumptions

- GitHub.com public profiles only; GitHub Enterprise and user OAuth are
  out of scope.
- Five periods: Last 12 months plus up to four calendar years. The
  GraphQL query always requests the current year and the three years
  before it (GraphQL aliases must be static); which of those become
  options is then decided by which years GitHub actually reports
  contribution history for. An account whose most recent activity is
  older than that four-year window won't get an entry — a deliberate MVP
  trade-off over doing a two-step "discover years, then query" round
  trip.
- Years GitHub reports but whose public calendar is empty keep their
  entry rather than being dropped, and say so in the scene. GitHub lists
  years it has *any* record for, including contributions that aren't
  publicly visible, so an empty year is information rather than a bug.
- The current calendar year is year-to-date and intentionally overlaps
  the rolling period.
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
  it is matters more than what made it. The button is always available
  and captures whichever state is on screen: flat gives the chart, tilted
  gives the city, and a permanently visible button has to do the obvious
  thing rather than silently export a view nobody is looking at.
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
