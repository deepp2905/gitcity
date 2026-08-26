"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ContributionDay, ContributionPeriod } from "@/lib/contributions/types";
import {
  buildHeatmapGrid,
  buildMonthLabels,
  formatDayLabel,
} from "@/lib/contributions/grid";
import { levelColorByName } from "@/lib/theme/palette";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** GitHub shows only alternating weekday labels to avoid crowding; the
 * rest stay available to screen readers via the row header. */
const VISIBLE_WEEKDAY_ROWS = new Set([1, 3, 5]);

type ActiveDay = {
  day: ContributionDay;
  /** Position of the cell's centre, relative to the grid container. */
  x: number;
  y: number;
};

type HeatmapProps = {
  period: ContributionPeriod;
  login: string;
  /** In 3D mode the grid stays mounted but visually hidden, so screen
   * readers keep the same information the sighted view lost. */
  visuallyHidden?: boolean;
};

export function Heatmap({ period, login, visuallyHidden = false }: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const { weekCount, cells } = useMemo(
    () => buildHeatmapGrid(period.days),
    [period.days],
  );
  const monthLabels = useMemo(
    () => buildMonthLabels(period.days),
    [period.days],
  );

  const [active, setActive] = useState<ActiveDay | null>(null);

  /** The single cell in the roving-tabindex sequence. Defaults to the most
   * recent day so keyboard users land on the newest data. */
  const lastDay = period.days[period.days.length - 1];
  const [focusedCell, setFocusedCell] = useState<{
    weekday: number;
    weekIndex: number;
  }>(() =>
    lastDay
      ? { weekday: lastDay.weekday, weekIndex: lastDay.weekIndex }
      : { weekday: 0, weekIndex: 0 },
  );

  const showTooltip = useCallback((day: ContributionDay, element: HTMLElement) => {
    const container = containerRef.current;
    if (!container) return;
    const cellRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setActive({
      day,
      x: cellRect.left - containerRect.left + cellRect.width / 2,
      y: cellRect.top - containerRect.top,
    });
  }, []);

  const hideTooltip = useCallback(() => setActive(null), []);

  /** Moves roving focus to the nearest cell holding a day, scanning in the
   * direction of travel so the partial first/last weeks are skipped. */
  const moveFocus = useCallback(
    (deltaWeekday: number, deltaWeek: number) => {
      let { weekday, weekIndex } = focusedCell;

      for (let step = 0; step < 7 * (weekCount + 1); step++) {
        weekday += deltaWeekday;
        weekIndex += deltaWeek;

        // Wrap weekday movement into the neighbouring week column so
        // Up/Down traverses the calendar continuously.
        if (weekday > 6) {
          weekday = 0;
          weekIndex += 1;
        } else if (weekday < 0) {
          weekday = 6;
          weekIndex -= 1;
        }

        if (weekIndex < 0 || weekIndex >= weekCount) return;

        if (cells[weekday]?.[weekIndex]) {
          setFocusedCell({ weekday, weekIndex });
          const selector = `[data-cell="${weekday}-${weekIndex}"]`;
          const next = gridRef.current?.querySelector<HTMLElement>(selector);
          next?.focus();
          return;
        }
      }
    },
    [cells, focusedCell, weekCount],
  );

  const jumpTo = useCallback(
    (day: ContributionDay | undefined) => {
      if (!day) return;
      setFocusedCell({ weekday: day.weekday, weekIndex: day.weekIndex });
      const selector = `[data-cell="${day.weekday}-${day.weekIndex}"]`;
      gridRef.current?.querySelector<HTMLElement>(selector)?.focus();
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          moveFocus(0, 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          moveFocus(0, -1);
          break;
        case "ArrowDown":
          event.preventDefault();
          moveFocus(1, 0);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveFocus(-1, 0);
          break;
        case "Home":
          event.preventDefault();
          jumpTo(period.days[0]);
          break;
        case "End":
          event.preventDefault();
          jumpTo(period.days[period.days.length - 1]);
          break;
        case "Escape":
          hideTooltip();
          break;
      }
    },
    [moveFocus, jumpTo, period.days, hideTooltip],
  );

  if (weekCount === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No contributions to show for {period.label.toLowerCase()}.
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      className={
        visuallyHidden ? "sr-only" : "relative [--cell:11px] sm:[--cell:13px]"
      }
    >
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          {/* Month labels — decorative; the accessible date lives on each cell. */}
          <div
            aria-hidden="true"
            className="relative ml-8 h-4 text-xs text-ink-muted"
            style={{ width: `calc(${weekCount} * (var(--cell) + 3px))` }}
          >
            {monthLabels.map((month) => (
              <span
                key={`${month.label}-${month.weekIndex}`}
                className="absolute top-0"
                style={{
                  left: `calc(${month.weekIndex} * (var(--cell) + 3px))`,
                }}
              >
                {month.label}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            role="grid"
            aria-label={`Contribution heatmap for ${login}, ${period.label.toLowerCase()}`}
            onKeyDown={handleKeyDown}
            onMouseLeave={hideTooltip}
            className="flex flex-col gap-[3px]"
          >
            {cells.map((row, weekday) => (
              <div key={weekday} role="row" className="flex gap-[3px]">
                <span
                  role="rowheader"
                  className="w-8 shrink-0 pr-2 text-right text-xs leading-[var(--cell)] text-ink-muted"
                >
                  {VISIBLE_WEEKDAY_ROWS.has(weekday) ? (
                    WEEKDAY_NAMES[weekday].slice(0, 3)
                  ) : (
                    <span className="sr-only">{WEEKDAY_NAMES[weekday]}</span>
                  )}
                </span>

                {row.map((day, weekIndex) => {
                  if (!day) {
                    return (
                      <span
                        key={weekIndex}
                        role="gridcell"
                        aria-hidden="true"
                        className="size-[var(--cell)] shrink-0"
                      />
                    );
                  }

                  const isFocusTarget =
                    focusedCell.weekday === weekday &&
                    focusedCell.weekIndex === weekIndex;

                  return (
                    <span
                      key={weekIndex}
                      role="gridcell"
                      data-cell={`${weekday}-${weekIndex}`}
                      tabIndex={isFocusTarget ? 0 : -1}
                      aria-label={formatDayLabel(day)}
                      onFocus={(event) => {
                        setFocusedCell({ weekday, weekIndex });
                        showTooltip(day, event.currentTarget);
                      }}
                      onBlur={hideTooltip}
                      onPointerEnter={(event) =>
                        showTooltip(day, event.currentTarget)
                      }
                      className="size-[var(--cell)] shrink-0 rounded-[2px] outline-none ring-ink/70 transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-offset-1"
                      style={{ backgroundColor: levelColorByName[day.level] }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {active ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2 py-1 text-xs font-medium text-white shadow-md"
          style={{ left: active.x, top: active.y - 6 }}
        >
          <span className="tabular-nums">{formatDayLabel(active.day)}</span>
        </div>
      ) : null}
    </div>
  );
}
