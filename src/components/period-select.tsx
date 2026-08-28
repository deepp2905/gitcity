"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ContributionPeriod, PeriodId } from "@/lib/contributions/types";

type PeriodSelectProps = {
  periods: ContributionPeriod[];
  activeId: PeriodId;
  onSelect: (id: PeriodId) => void;
};

/**
 * Period picker as a dropdown rather than a tab strip.
 *
 * Five tabs are wider than a phone and were the widest thing in the
 * controls row; one button naming the current period is a fraction of
 * that, and the choices only need to exist while someone is choosing.
 *
 * The menu opens **upward**. The row sits at the bottom of the viewport,
 * so downward there is nothing but the edge of the screen.
 *
 * Follows the listbox pattern: a button that owns the value, and a list
 * of options that takes focus while open. Arrow keys move, Enter and
 * Space choose, Escape returns to the button without changing anything.
 */
export function PeriodSelect({
  periods,
  activeId,
  onSelect,
}: PeriodSelectProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeIndex = Math.max(
    0,
    periods.findIndex((period) => period.id === activeId),
  );

  /** Focus follows the open state: into the current option on open, back
   * to the button on close. Without it the menu opens behind the
   * keyboard's back, and closing strands focus on a removed node. */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      const options = listRef.current?.querySelectorAll<HTMLElement>(
        '[role="option"]',
      );
      options?.[activeIndex]?.focus();
    } else if (wasOpen.current) {
      buttonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open, activeIndex]);

  // Pointer down rather than click: a click that lands on another control
  // should close this and reach that control in the same gesture.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  if (periods.length <= 1) return null;

  const active = periods[activeIndex];

  function choose(id: PeriodId) {
    onSelect(id);
    setOpen(false);
  }

  function moveFocus(delta: number, from: number) {
    const next = (from + delta + periods.length) % periods.length;
    const options = listRef.current?.querySelectorAll<HTMLElement>(
      '[role="option"]',
    );
    options?.[next]?.focus();
  }

  function handleListKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1, index);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1, index);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(-index, index);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(periods.length - 1 - index, index);
    } else if (event.key === "Tab") {
      // Nothing to tab to inside a menu, and leaving it open behind the
      // next control would strand it over the city.
      setOpen(false);
    }
  }

  return (
    // Fixed width, so the row doesn't reflow when the chosen period goes
    // from "Last 12 months" to "2024". Wide enough for the longest label
    // the picker can hold; the trigger and the menu both take it, so the
    // menu lines up with the button exactly.
    <div ref={rootRef} className="relative w-40 shrink-0">
      {open ? (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Contribution period"
          // Above the button, not below: this row is pinned to the
          // bottom of the viewport. Shadowed, unlike the controls at
          // rest, because it floats over the city and needs to separate
          // from whatever colour happens to be behind it.
          // Radius is concentric: the options are 36px pills, so an 18px
          // inner radius plus the 4px of padding gives 22px outside. A
          // smaller outer radius would leave the corner options bulging
          // into it.
          className="menu-up-enter absolute bottom-full left-0 z-20 mb-2 w-full rounded-[22px] border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] p-1 shadow-[var(--shadow-raised)] backdrop-blur-md"
        >
          {periods.map((period, index) => {
            const isActive = period.id === activeId;
            return (
              <button
                key={period.id}
                type="button"
                role="option"
                aria-selected={isActive}
                tabIndex={-1}
                onClick={() => choose(period.id)}
                onKeyDown={(event) => handleListKeyDown(event, index)}
                className={`flex h-9 w-full items-center justify-start rounded-full px-3.5 text-left text-sm font-medium tabular-nums transition-[background-color,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
      ) : null}

      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          // Either arrow opens it, matching how a native select behaves.
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-full border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] pl-4 pr-3 text-sm font-medium tabular-nums text-ink backdrop-blur-md transition-[background-color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-canvas-raised active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {active.label}
        {/* Points the way the menu opens, and flips once it has. */}
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`size-4 text-ink-muted transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 12 4-4 4 4" />
        </svg>
      </button>
    </div>
  );
}
