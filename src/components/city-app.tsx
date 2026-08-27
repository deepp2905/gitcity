"use client";

import { useCallback, useEffect, useState } from "react";
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
import { ViewToggle } from "./view-toggle";
import { useWebGLSupport } from "@/lib/hooks/use-webgl-support";

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

  // Loading and error are derived, never synced in an effect: a request is
  // in flight whenever the settled outcome doesn't answer the key the
  // current URL asks for, and an error only counts while it's still the
  // answer to that same key.
  const isSettled = outcome?.key === requestKey;
  const isLoading = user !== null && !isSettled;
  const error = isSettled ? outcome.error : null;

  const activePeriod =
    data?.periods.find((p) => p.id === period) ?? data?.periods[0] ?? null;

  const hasCity = Boolean(data && activePeriod);

  return (
    /*
     * Three bands: chrome at the top, the city breathing in the middle,
     * chrome at the bottom. The city is a fixed full-viewport backdrop
     * rendered inside this subtree, so every content block needs its own
     * positive z-index -- within a stacking context a positioned element
     * paints above non-positioned in-flow content. pointer-events are off
     * here and re-enabled per control so clicks and hovers reach the
     * scene through the gaps.
     */
    <main className="pointer-events-none relative z-10 flex min-h-screen w-full flex-col px-6 py-6">
      <header className="pointer-events-auto relative z-10 mx-auto w-full max-w-7xl shrink-0">
        {hasCity ? (
          // Compact once there is a city to look at: the pitch has been
          // made, and the visualization should own the viewport.
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold tracking-tight text-ink">
              Contribution City
            </p>
            <SearchForm
              key={user ?? "empty"}
              initialValue={user ?? ""}
              isLoading={isLoading}
              onSubmit={handleSearch}
              compact
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 pt-10 text-center sm:pt-16">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-ink text-balance sm:text-4xl">
                Build your contribution city
              </h1>
              <p className="mx-auto max-w-md text-base text-ink-muted text-pretty">
                See a GitHub contribution history as a heatmap, then watch it
                rise into a skyline.
              </p>
            </div>
            <SearchForm
              key={user ?? "empty"}
              initialValue={user ?? ""}
              isLoading={isLoading}
              onSubmit={handleSearch}
            />
          </div>
        )}

        {error ? (
          <p
            role="alert"
            className="mx-auto mt-3 w-full max-w-md rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-center text-sm text-danger"
          >
            {error.message}
          </p>
        ) : null}
      </header>

      {/* The city shows through this band. Nothing is laid out over it. */}
      <div className="flex flex-1 items-center justify-center">
        {isLoading && !data ? (
          <p className="pointer-events-auto relative z-10 text-sm text-ink-muted">
            Loading contributions…
          </p>
        ) : null}
      </div>

      {data && activePeriod ? (
        <Visualization
          period={activePeriod}
          profile={data.profile}
          view={view}
          webglSupported={webglSupported}
          onToggleView={handleToggleView}
        />
      ) : null}

      <footer className="pointer-events-auto relative z-10 mx-auto flex w-full max-w-7xl shrink-0 flex-col items-center gap-2">
        {data && activePeriod ? (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <ProfileIdentity profile={data.profile} />
              <PeriodTabs
                periods={data.periods}
                activeId={activePeriod.id}
                onSelect={handleSelectPeriod}
              />
              {webglSupported ? (
                <ViewToggle view={view} onToggle={handleToggleView} />
              ) : null}
            </div>
            <PeriodTotal period={activePeriod} />
          </>
        ) : null}

        <p className="text-xs text-ink-subtle">
          Data from GitHub. Not affiliated with GitHub, Inc.
        </p>
      </footer>
    </main>
  );
}
