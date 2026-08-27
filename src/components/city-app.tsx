"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ContributionErrorCode,
  ContributionResponse,
  PeriodId,
} from "@/lib/contributions/types";
import { fetchContributions } from "@/lib/api/fetch-contributions";
import {
  buildUrlQuery,
  readUrlState,
  type ViewMode,
} from "@/lib/state/url-state";
import { SearchForm } from "./search-form";
import { PeriodTotal, ProfileIdentity } from "./profile-header";
import { Visualization } from "./visualization";
import { PeriodTabs } from "./period-tabs";
import { useWebGLSupport } from "@/lib/hooks/use-webgl-support";
import { buildMockPeriod } from "@/lib/contributions/mock";
import { isInteractive, resolvePhase } from "@/lib/state/phase";

/** How long real data is held flat before the city rises. */
const INTRO_HOLD_MS = 800;

/**
 * Shortest time the loading wave runs. A fixture or cached response can
 * answer in ~20ms, and without a floor the wave would flash past unseen.
 */
const LOADING_MIN_MS = 900;

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
  const { user, period, view } = readUrlState(
    new URLSearchParams(searchParams.toString()),
  );

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
    (next: { user?: string | null; period?: PeriodId; view?: ViewMode }, replace: boolean) => {
      const href = buildUrlQuery({
        user: next.user !== undefined ? next.user : user,
        period: next.period ?? period,
        view: next.view ?? view,
      });
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [router, user, period, view],
  );

  // A new search is a new history entry; period/view changes replace it so
  // rapid tab and mode toggling doesn't flood the Back button.
  const handleSearch = useCallback(
    (username: string) => {
      if (username === user) {
        // Same URL, so no navigation would fire — retry explicitly.
        setReloadToken((token) => token + 1);
        return;
      }
      navigate({ user: username }, false);
    },
    [navigate, user],
  );

  const handleSelectPeriod = useCallback(
    (nextPeriod: PeriodId) => navigate({ period: nextPeriod }, true),
    [navigate],
  );

  const handleToggleView = useCallback(
    (nextView: ViewMode) => navigate({ view: nextView }, true),
    [navigate],
  );

  /**
   * Set once the minimum loading time has passed for a given request.
   * Derived by comparison rather than a boolean reset in an effect, which
   * would be a synchronous setState during render.
   */
  const [minElapsedKey, setMinElapsedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(
      () => setMinElapsedKey(requestKey),
      LOADING_MIN_MS,
    );
    return () => window.clearTimeout(timer);
  }, [user, requestKey]);

  const isSettled = outcome?.key === requestKey;
  const error = isSettled ? outcome.error : null;

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
  const latestRef = useRef({ view, navigate });

  useEffect(() => {
    latestRef.current = { view, navigate };
  });

  useEffect(() => {
    // Keyed on the phase reaching ready, not on the data arriving: the
    // wave has its own minimum, and the hold is meant to follow the flat
    // reveal rather than overlap it.
    if (phase !== "ready" || !user) return;
    if (introDoneRef.current === user) return;

    introDoneRef.current = user;

    if (latestRef.current.view === "3d") return;

    const timer = window.setTimeout(() => {
      // Only if they haven't already gone there themselves.
      if (latestRef.current.view === "2d") {
        latestRef.current.navigate({ view: "3d" }, true);
      }
    }, INTRO_HOLD_MS);

    return () => window.clearTimeout(timer);
    // Deliberately not depending on `view` or `navigate`: both change on
    // an unrelated period switch, which would tear down the pending timer
    // and the intro would never fire.
  }, [phase, user]);

  // Loading and error are derived, never synced in an effect: a request is
  // in flight whenever the settled outcome doesn't answer the key the
  // current URL asks for, and an error only counts while it's still the
  // answer to that same key.

  const realPeriod =
    data?.periods.find((p) => p.id === period) ?? data?.periods[0] ?? null;

  /**
   * The idle city. Built once from a fixed seed, so it is the same on the
   * server and the client and doesn't reshuffle between renders.
   */
  const mockPeriod = useMemo(() => buildMockPeriod(new Date()), []);

  // One chart, always on screen. Before a search it shows the mock; while
  // a search runs it keeps showing whatever is there and the wave takes
  // over its heights; once data lands it shows that.
  const shownPeriod = phase === "ready" && realPeriod ? realPeriod : mockPeriod;
  const shownProfile = phase === "ready" && data ? data.profile : MOCK_PROFILE;
  const showControls = phase === "ready" && data !== null && realPeriod !== null;

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
      <header
        className="chrome-enter pointer-events-auto relative z-10 mx-auto w-full max-w-7xl shrink-0"
      >
        <p className="text-sm font-semibold tracking-tight text-ink">gitCity</p>
      </header>

      {/* The city shows through here. Nothing is laid out over it. */}
      <div className="flex-1" />

      <Visualization
        period={shownPeriod}
        profile={shownProfile}
        view={view}
        target={sceneTarget}
        waving={phase === "loading"}
        interactive={isInteractive(phase)}
        webglSupported={webglSupported}
        onToggleView={handleToggleView}
      />

      <footer
        className="chrome-enter pointer-events-auto relative z-10 mx-auto flex w-full max-w-xl shrink-0 flex-col items-center gap-3"
        style={{ "--enter-delay": "80ms" } as React.CSSProperties}
      >
        {error ? (
          <p
            role="alert"
            className="w-full rounded-lg border border-danger/30 bg-danger-bg px-4 py-2.5 text-center text-sm text-danger"
          >
            {error.message}
          </p>
        ) : null}

        {/*
          Controls arrive with the data rather than sitting there disabled:
          before a search there is nothing to pick a year of, and nobody
          whose profile to show.
        */}
        {showControls ? (
          <div className="flex w-full min-w-0 flex-col items-center gap-2">
            <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-2">
              <ProfileIdentity profile={data!.profile} />
              <PeriodTabs
                periods={data!.periods}
                activeId={realPeriod!.id}
                onSelect={handleSelectPeriod}
              />
            </div>
            <PeriodTotal period={realPeriod!} />
          </div>
        ) : null}

        <SearchForm
          key={user ?? "empty"}
          initialValue={user ?? ""}
          isLoading={phase === "loading"}
          onSubmit={handleSearch}
        />
      </footer>
    </main>
  );
}
