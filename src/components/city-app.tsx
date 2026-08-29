"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ContributionErrorCode,
  ContributionResponse,
  PeriodId,
} from "@/lib/contributions/types";
import { fetchContributions } from "@/lib/api/fetch-contributions";
import {
  DEFAULT_PERIOD_ID,
  buildUrlQuery,
  readUrlState,
} from "@/lib/state/url-state";
import { DEFAULT_VIEW, type ViewMode } from "@/lib/state/view";
import { SearchForm } from "./search-form";
import { SuggestedUsers } from "./suggested-users";
import { PeriodTotal, ProfileIdentity } from "./profile-header";
import { Visualization } from "./visualization";
import { PeriodSelect } from "./period-select";
import { DownloadButton } from "./download-button";
import { useWebGLSupport } from "@/lib/hooks/use-webgl-support";
import { buildMockPeriod } from "@/lib/contributions/mock";
import { useMockSeed } from "@/lib/hooks/use-mock-seed";
import { isInteractive, pickLoadingFloorMs, resolvePhase } from "@/lib/state/phase";

/**
 * How long real data is held flat before the city rises.
 *
 * Has to outlast the arrival — `WAVE_SETTLE_MS` plus
 * `waveArrivalSpreadMs`, currently 960ms. The wave branch owns the frame
 * while cells are still arriving, so a shorter hold would tilt the camera
 * over buildings that have not been released yet.
 */
const INTRO_HOLD_MS = 1000;

/**
 * When the controls arrive, measured from the moment the data is ready.
 *
 * The hold, plus half of `staggerTotalMs` — the rise sweeps left to right
 * over that, so this lands the fade squarely mid-wave. Any earlier and
 * the chrome competes with the city for attention while it is still
 * moving; any later and it reads as an afterthought.
 */
const CONTROLS_REVEAL_MS = INTRO_HOLD_MS + 300;


/** Stand-in identity for the idle city, which belongs to nobody. */
const MOCK_PROFILE = {
  login: "mock",
  name: null,
  avatarUrl: "",
  profileUrl: "https://github.com",
};

type FetchError = { code: ContributionErrorCode; message: string };

/** Result of the most recent settled fetch, tagged with the request key it
 * answered so staleness can be derived rather than tracked in an effect. */
type Outcome = { key: string; error: FetchError | null };

export function CityApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const webglSupported = useWebGLSupport();
  const { user, period } = readUrlState(
    new URLSearchParams(searchParams.toString()),
  );

  /** Standing or flat. Client state, not a URL param — see view.ts. */
  const [view, setView] = useState<ViewMode>(DEFAULT_VIEW);

  /**
   * A malformed username, caught before any request goes out.
   *
   * Kept here rather than inside the form so it shares one banner with a
   * failed lookup. "That isn't a username" and "no such user" are the
   * same news to whoever typed it, and they were arriving in two
   * different styles in two different places.
   */
  const [formError, setFormError] = useState<string | null>(null);
  const errorId = useId();

  /**
   * `data` is deliberately independent of the URL: a failed search leaves
   * the previously loaded city on screen (per spec) rather than clearing
   * it, with the error shown inline alongside it.
   */
  const [data, setData] = useState<ContributionResponse | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  /** Bumped when the same username is submitted again, so re-submitting
   * after a failure retries even though the URL is unchanged. */
  const [reloadToken, setReloadToken] = useState(0);

  /** Identifies the fetch the current URL + retry count calls for. */
  const requestKey = `${user ?? ""}:${reloadToken}`;

  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();
    const key = `${user}:${reloadToken}`;

    fetchContributions(user, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;

        if (result.ok) {
          setData(result.data);
          setOutcome({ key, error: null });
        } else {
          // Keep `data` as-is so the existing graph survives the failure.
          setOutcome({
            key,
            error: { code: result.code, message: result.message },
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setOutcome({
          key,
          error: {
            code: "UPSTREAM_ERROR",
            message: "Something went wrong. Please try again.",
          },
        });
      });

    return () => controller.abort();
  }, [user, reloadToken]);

  const navigate = useCallback(
    (next: { user?: string | null; period?: PeriodId }, replace: boolean) => {
      const href = buildUrlQuery({
        user: next.user !== undefined ? next.user : user,
        period: next.period ?? period,
      });
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [router, user, period],
  );

  // A new search is a new history entry; a period change replaces it so
  // rapid tab switching doesn't flood the Back button.
  const handleSearch = useCallback(
    (username: string) => {
      setFormError(null);
      // Every search starts flat, so the data lands on the familiar grid
      // and then rises. Without this a second search made from a standing
      // city would skip straight past the reveal.
      setView(DEFAULT_VIEW);

      if (username === user) {
        // Same URL, so no navigation would fire — retry explicitly.
        setReloadToken((token) => token + 1);
        return;
      }
      navigate({ user: username }, false);
    },
    [navigate, user],
  );

  /**
   * The wordmark goes home: back to the idle mock city and an empty
   * field.
   *
   * Bumping the reload token matters as much as clearing the username.
   * The intro rise is remembered against the request key, so without a
   * fresh one, searching the same person again would find them already
   * introduced and skip the rise, leaving the city flat.
   */
  const handleGoHome = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      // Let modified clicks open a tab the way any link would.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
        return;
      }
      event.preventDefault();

      setReloadToken((token) => token + 1);
      setView(DEFAULT_VIEW);
      setFormError(null);
      navigate({ user: null, period: DEFAULT_PERIOD_ID }, false);
    },
    [navigate],
  );

  const handleSelectPeriod = useCallback(
    (nextPeriod: PeriodId) => navigate({ period: nextPeriod }, true),
    [navigate],
  );

  const handleToggleView = useCallback((nextView: ViewMode) => {
    setView(nextView);
  }, []);

  /**
   * Set once the minimum loading time has passed for a given request.
   * Derived by comparison rather than a boolean reset in an effect, which
   * would be a synchronous setState during render.
   */
  const [minElapsedKey, setMinElapsedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Rolled per request, inside the effect: calling Math.random during
    // render would differ between the server and client pass.
    const timer = window.setTimeout(
      () => setMinElapsedKey(requestKey),
      pickLoadingFloorMs(),
    );
    return () => window.clearTimeout(timer);
  }, [user, requestKey]);

  const isSettled = outcome?.key === requestKey;
  const error = isSettled ? outcome.error : null;

  // A local validation failure wins: it is about what is in the field
  // right now, where a stale lookup error is about the last thing that
  // was submitted.
  const errorMessage = formError ?? error?.message ?? null;

  const phase = resolvePhase({
    user,
    loadedLogin: data?.profile.login ?? null,
    minElapsed: minElapsedKey === requestKey,
    hasError: Boolean(error),
  });

  /**
   * First look: hold the familiar flat grid briefly, then rise into the
   * city on its own. Seeing the heatmap first is what makes the transform
   * legible -- landing straight in 3D gives no before to compare against.
   *
   * Once per username. A manual flatten afterwards is respected rather
   * than immediately undone, and a link that already says 3d skips it.
   */
  const introDoneRef = useRef<string | null>(null);

  useEffect(() => {
    // Keyed on the phase reaching ready, not on the data arriving: the
    // wave has its own minimum, and the hold is meant to follow the flat
    // reveal rather than overlap it.
    //
    // Remembered against the request key rather than the username, so
    // going home and searching the same person again is a fresh arrival
    // and rises again.
    if (phase !== "ready" || !user) return;
    if (introDoneRef.current === requestKey) return;

    introDoneRef.current = requestKey;

    const timer = window.setTimeout(() => {
      // Functional update, so the current view is read at the moment the
      // timer fires without the effect having to depend on it. A manual
      // rise during the hold is left alone rather than re-applied.
      setView((current) => (current === "2d" ? "3d" : current));
    }, INTRO_HOLD_MS);

    return () => window.clearTimeout(timer);
    // `view` is deliberately absent: depending on it would tear down the
    // pending timer the moment anything else moved the camera.
  }, [phase, user, requestKey]);

  // Loading and error are derived, never synced in an effect: a request is
  // in flight whenever the settled outcome doesn't answer the key the
  // current URL asks for, and an error only counts while it's still the
  // answer to that same key.

  const realPeriod =
    data?.periods.find((p) => p.id === period) ?? data?.periods[0] ?? null;

  /**
   * The idle city, re-rolled once per visit.
   *
   * The fixed seed is only for the first render: the server and the
   * client must produce identical markup, and the accessible heatmap
   * renders this period during SSR. Re-seeding in an effect happens
   * after hydration has already agreed, so it is a state change rather
   * than a mismatch.
   *
   * Nobody sees the seeded one. The 3D scene is a client-only dynamic
   * import that renders nothing until it loads, and the heatmap this
   * feeds is visually hidden.
   */
  const mockSeed = useMockSeed();
  const mockPeriod = useMemo(
    () => buildMockPeriod(new Date(), mockSeed),
    [mockSeed],
  );

  // One chart, always on screen. Before a search it shows the mock; while
  // a search runs it keeps showing whatever is there and the wave takes
  // over its heights; once data lands it shows that.
  const shownPeriod = phase === "ready" && realPeriod ? realPeriod : mockPeriod;
  const shownProfile = phase === "ready" && data ? data.profile : MOCK_PROFILE;
  const showControls = phase === "ready" && data !== null && realPeriod !== null;

  /** The scene only answers taps once there is real data in it. */
  const canToggle = isInteractive(phase);

  /**
   * Whether the controls have arrived, keyed to the request they belong
   * to so a fresh search takes them away again rather than leaving the
   * previous city's chrome standing over the new one.
   */
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "ready") return;
    const timer = window.setTimeout(
      () => setRevealedKey(requestKey),
      CONTROLS_REVEAL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, requestKey]);

  const revealed = revealedKey === requestKey && showControls;

  /** Filled in by the scene with a snapshot function for the PNG export. */
  const captureRef = useRef<(() => HTMLCanvasElement | null) | null>(null);

  /**
   * The idle city stays tilted, so the page opens on the thing the
   * product makes rather than on a chart. A search flattens it, which is
   * what gives the wave somewhere to run and the data somewhere to land.
   */
  const sceneTarget =
    phase === "idle" ? 1 : phase === "loading" ? 0 : view === "3d" ? 1 : 0;

  return (
    /*
     * One page, one chart. The city is a fixed full-viewport backdrop
     * rendered inside this subtree and is on screen in every phase, so
     * there is no landing view that gets replaced by an app view.
     *
     * Everything else is chrome pinned to the edges: a wordmark at the
     * top, the controls at the bottom. Being inside the same subtree as
     * the canvas, each block needs its own positive z-index -- within a
     * stacking context a positioned element paints above non-positioned
     * in-flow content. pointer-events are off here and re-enabled per
     * control so taps and hovers reach the city through every gap.
     */
    <main className="safe-padding pointer-events-none relative z-10 flex min-h-dvh w-full flex-col">
      {/* Pointer events stay off: the wordmark isn't interactive, and a
          full-width bar that swallowed them would put a dead strip across
          the top of the city. */}
      {/* A real anchor, so middle-click and cmd-click open a tab like
          any other link; the handler only takes over the plain click.
          pointer-events stay off on the bar and on for the mark alone, so
          the rest of the strip doesn't shadow the city.

          It leaves upward while a search runs, as the field leaves
          downward: the chrome retreats to the edges and the city has the
          screen to itself. Opacity rather than display, so the header
          keeps its height and nothing below it moves. */}
      <header className="chrome-enter relative z-10 mx-auto w-full max-w-7xl shrink-0 text-center">
        <Link
          href="/"
          onClick={handleGoHome}
          aria-hidden={phase === "loading" ? true : undefined}
          tabIndex={phase === "loading" ? -1 : undefined}
          className={`inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold tracking-tight text-ink transition-[background-color,opacity,translate,scale] duration-300 ease-[var(--ease-in-out-cubic)] hover:bg-ink/5 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
            phase === "loading"
              ? "pointer-events-none -translate-y-2 opacity-0"
              : "pointer-events-auto translate-y-0 opacity-100"
          }`}
        >
          gitCity
        </Link>
      </header>

      {/* The city shows through here. Nothing is laid out over it. */}
      <div className="flex-1" />

      <Visualization
        period={shownPeriod}
        profile={shownProfile}
        view={view}
        target={sceneTarget}
        waving={phase === "loading"}
        interactive={canToggle}
        webglSupported={webglSupported}
        onToggleView={handleToggleView}
        captureRef={captureRef}
      />

      {/*
        Wider than the field it contains. The identity pill and five
        period tabs together need more room than a search box does, and
        squeezing them into the field's width forced the strip to scroll
        and clipped the last year off.
      */}
      <footer
        className="chrome-enter pointer-events-auto relative z-10 mx-auto flex w-full max-w-3xl shrink-0 flex-col items-center gap-3"
        style={{ "--enter-delay": "80ms" } as React.CSSProperties}
      >
        {/*
          One line for both kinds of failure, just above the field. Bare
          text rather than a bordered banner: a box announces itself
          before it is read, and this sits beside a search field where
          being wrong is routine.

          pl-5 matches the field's own padding, so the message starts on
          the same vertical as the placeholder it is about. No entrance
          animation — validation should answer the keystroke that asked
          for it, and even a short delay reads as lag.
        */}
        {errorMessage ? (
          <p
            id={errorId}
            role="alert"
            className="w-full max-w-md pl-5 text-sm text-danger"
          >
            {errorMessage}
          </p>
        ) : null}

        {/*
          One slot, two occupants. The field hands over to the controls
          rather than moving aside for them, so the bottom of the page
          holds a single line throughout and nothing below it shifts.

          Both are absolutely positioned and always mounted, which is what
          lets them cross-fade: laying them out in flow would make the
          outgoing one collapse the moment it left.
        */}
        <div className="relative flex min-h-11 w-full items-center justify-center">
          {/*
            8px, not 16. Paired with a fade, a longer drop reads as the
            control falling out of the page rather than stepping back from
            it — and it has to clear before the replacement arrives.
          */}
          <div
            aria-hidden={phase === "idle" ? undefined : true}
            className={`absolute inset-x-0 top-0 flex justify-center transition-[opacity,translate] duration-300 ease-[var(--ease-in-out-cubic)] ${
              phase === "idle"
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-2 opacity-0"
            }`}
          >
            <SearchForm
              key={user ?? "empty"}
              initialValue={user ?? ""}
              isLoading={phase === "loading"}
              shouldFocus={phase === "idle"}
              invalid={errorMessage !== null}
              errorId={errorId}
              onError={setFormError}
              onSubmit={handleSearch}
            />
          </div>

          {/*
            Wraps rather than overflowing: the identity pill grows with
            the username and the picker is a fixed width, so on a narrow
            phone the three controls can exceed the line.
          */}
          <div
            aria-hidden={revealed ? undefined : true}
            className={`absolute inset-x-0 top-0 flex min-w-0 flex-wrap items-center justify-center gap-2 transition-opacity duration-500 ease-[var(--ease-in-out-cubic)] ${
              revealed ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {showControls ? (
              <>
                <ProfileIdentity profile={data!.profile} />
                <PeriodSelect
                  periods={data!.periods}
                  activeId={realPeriod!.id}
                  onSelect={handleSelectPeriod}
                />
                <DownloadButton
                  profile={data!.profile}
                  period={realPeriod!}
                  captureRef={captureRef}
                />
              </>
            ) : null}
          </div>
        </div>

        {/*
          The last line swaps the same way the one above it does: a few
          accounts to try while idle, the selected period's total once
          there is one. Two things that never coexist, so they share a
          line rather than each reserving their own.
        */}
        <div className="relative flex min-h-8 w-full items-center justify-center">
          <div
            aria-hidden={phase === "idle" ? undefined : true}
            className={`absolute inset-x-0 top-0 flex justify-center transition-[opacity,translate] duration-300 ease-[var(--ease-in-out-cubic)] ${
              phase === "idle"
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-2 opacity-0"
            }`}
          >
            {/* Same box as the search form above, so the row lines up
                with the field rather than with the page. */}
            <div className="w-full max-w-md">
              <SuggestedUsers onSelect={handleSearch} />
            </div>
          </div>

          {/*
            pointer-events-none unconditionally. The total is never
            interactive, and being absolutely positioned it lies over the
            suggestions — at opacity 0 it is invisible but still the
            topmost element, so it was swallowing every tap meant for
            them.
          */}
          <div
            aria-hidden={revealed ? undefined : true}
            className={`pointer-events-none absolute inset-x-0 top-0 flex h-8 items-center justify-center transition-opacity duration-500 ease-[var(--ease-in-out-cubic)] ${
              revealed ? "opacity-100" : "opacity-0"
            }`}
          >
            {showControls ? <PeriodTotal period={realPeriod!} /> : null}
          </div>
        </div>
      </footer>
    </main>
  );
}
