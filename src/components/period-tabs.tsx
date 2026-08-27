"use client";

import type { ContributionPeriod, PeriodId } from "@/lib/contributions/types";

type PeriodTabsProps = {
  periods: ContributionPeriod[];
  activeId: PeriodId;
  onSelect: (id: PeriodId) => void;
};

/**
 * Floating segmented control. Uses the ARIA tablist pattern with roving
 * tabindex: Left/Right move between tabs and activate them, matching the
 * "automatic activation" convention for tabs whose panels are cheap to
 * swap.
 */
export function PeriodTabs({ periods, activeId, onSelect }: PeriodTabsProps) {
  if (periods.length <= 1) return null;

  const activeIndex = Math.max(
    0,
    periods.findIndex((period) => period.id === activeId),
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (activeIndex + 1) % periods.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (activeIndex - 1 + periods.length) % periods.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = periods.length - 1;

    if (nextIndex === null) return;
    event.preventDefault();
    onSelect(periods[nextIndex].id);
    const selector = `[data-period="${periods[nextIndex].id}"]`;
    event.currentTarget.querySelector<HTMLElement>(selector)?.focus();
  }

  return (
    // Five tabs are wider than a phone, so the strip scrolls sideways
    // rather than wrapping to a second row or pushing the page into
    // horizontal overflow. shrink-0 on the tabs keeps them full size
    // inside it instead of being squeezed to fit.
    //
    // min-w-0 is what makes max-w-full bite: a flex item defaults to
    // min-width:auto and refuses to shrink below its content, so without
    // it the strip just overflows its parent instead of scrolling.
    <div className="min-w-0 max-w-full overflow-x-auto rounded-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div
        role="tablist"
        aria-label="Contribution period"
        onKeyDown={handleKeyDown}
        className="flex w-max gap-1 rounded-full border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] p-1 shadow-[var(--shadow-soft)] backdrop-blur-md"
      >
        {periods.map((period) => {
          const isActive = period.id === activeId;
          return (
            <button
              key={period.id}
              type="button"
              role="tab"
              data-period={period.id}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(period.id)}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium tabular-nums transition-[background-color,color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                isActive
                  ? "bg-ink text-white"
                  : "text-ink-muted hover:bg-ink/5 hover:text-ink"
              }`}
            >
              {period.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
