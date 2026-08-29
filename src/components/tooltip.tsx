/**
 * A label that appears on hover, after a beat.
 *
 * Rendered *inside* its trigger rather than wrapping it, so it costs the
 * layout nothing: the trigger only needs `group relative`, and a
 * positioned trigger — the tuning gear is `fixed` — already provides the
 * containing block.
 *
 * No JavaScript. The delay is `group-hover:delay-200` against a base
 * `delay-0`, which gives a pause on the way in and none on the way out;
 * a timer in state would be the same behaviour with a re-render per
 * hover. Tailwind's `hover` variant is behind `@media (hover: hover)`,
 * so this never fires from a tap.
 *
 * `aria-hidden`, deliberately. Every trigger already carries an
 * `aria-label` saying the same thing, and announcing both would read the
 * control's name twice.
 */
type TooltipProps = {
  label: string;
  /**
   * Where it sits relative to the trigger. Defaults to centred above,
   * which suits anything in the bottom chrome. Pass explicit classes for
   * triggers near an edge — a centred tooltip on a control at the right
   * margin hangs off the screen.
   */
  className?: string;
};

const DEFAULT_PLACEMENT = "bottom-full left-1/2 mb-2 -translate-x-1/2";

export function Tooltip({ label, className }: TooltipProps) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity delay-0 duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:opacity-100 group-hover:delay-200 group-focus-visible:opacity-100 ${
        className ?? DEFAULT_PLACEMENT
      }`}
    >
      {label}
    </span>
  );
}
