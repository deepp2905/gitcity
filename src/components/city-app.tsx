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
import { ProfileHeader } from "./profile-header";
import { Visualization } from "./visualization";
import { PeriodTabs } from "./period-tabs";

type FetchError = { code: ContributionErrorCode; message: string };

/** Result of the most recent settled fetch, tagged with the request key it
 * answered so staleness can be derived rather than tracked in an effect. */
type Outcome = { key: string; error: FetchError | null };

export function CityApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12 sm:py-16">
      <header className="flex flex-col items-center gap-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-ink text-balance sm:text-4xl">
            Build your contribution city
          </h1>
          <p className="mx-auto max-w-md text-base text-ink-muted text-pretty">
            See a GitHub contribution history as a heatmap, then watch it rise
            into a skyline.
          </p>
        </div>

        <div className="flex w-full justify-center">
          <SearchForm
            key={user ?? "empty"}
            initialValue={user ?? ""}
            isLoading={isLoading}
            onSubmit={handleSearch}
          />
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="mx-auto w-full max-w-md rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger"
        >
          {error.message}
        </p>
      ) : null}

      {isLoading && !data ? (
        <p className="text-center text-sm text-ink-muted">
          Loading contributions…
        </p>
      ) : null}

      {data && activePeriod ? (
        <>
          <section className="flex flex-col gap-6 rounded-xl border border-border bg-canvas-raised p-5 shadow-sm sm:p-6">
            <ProfileHeader profile={data.profile} period={activePeriod} />
            <Visualization
              period={activePeriod}
              profile={data.profile}
              view={view}
              onToggleView={handleToggleView}
            />
          </section>

          <div className="flex justify-center">
            <PeriodTabs
              periods={data.periods}
              activeId={activePeriod.id}
              onSelect={handleSelectPeriod}
            />
          </div>
        </>
      ) : null}

      <footer className="mt-auto pt-4 text-center text-xs text-ink-subtle">
        Data from GitHub. Not affiliated with GitHub, Inc.
      </footer>
    </main>
  );
}
