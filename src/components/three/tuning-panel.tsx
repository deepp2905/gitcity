"use client";

import { useState } from "react";
import {
  CONTROL_GROUPS,
  DEFAULT_SCENE_CONFIG,
  type ControlGroup,
  type SceneConfig,
} from "@/lib/three/config";

function iconProps(className = "size-3.5") {
  return {
    viewBox: "0 0 16 16",
    "aria-hidden": true,
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function CopyIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5A1.5 1.5 0 0 0 9 2H4a2 2 0 0 0-2 2v5a1.5 1.5 0 0 0 1.5 1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 8.5l3.2 3.2L13 4.8" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.77" />
      <path d="M2.4 2.8v3.2h3.2" />
    </svg>
  );
}

/**
 * A gear.
 *
 * The previous attempt was a circle with eight evenly spaced radiating
 * lines, which is a sun — the rays have to be *lobes on the outline* for
 * it to read as a mechanism, not spokes floating around a hub.
 *
 * Its own 24 viewBox because a toothed outline needs the room; the shared
 * 16 grid puts the teeth on half-pixels and they blur.
 */
function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * A switch.
 *
 * The whole row is the button, so the label is the accessible name and
 * the target is the width of the panel rather than a 36px track. The
 * hint sits outside it — a description belongs beside a control, not
 * inside its name.
 *
 * `translate` rather than `transform` on the knob: Tailwind v4 compiles
 * translate utilities to the standalone property, so a transition naming
 * `transform` would leave the knob snapping.
 */
function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="mb-2">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className="flex w-full items-center justify-between gap-3 rounded-md py-1 text-left text-xs text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {label}
        <span
          aria-hidden="true"
          className={`relative h-4 w-7 shrink-0 rounded-full transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] ${
            value ? "bg-ink" : "bg-ink/15"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 size-3 rounded-full bg-white shadow-sm transition-[translate] duration-150 ease-[cubic-bezier(0.2,0,0,1)] ${
              value ? "translate-x-3" : "translate-x-0"
            }`}
          />
        </span>
      </button>
      {hint ? (
        <span className="text-[10px] text-ink-subtle">{hint}</span>
      ) : null}
    </div>
  );
}

type TuningPanelProps = {
  config: SceneConfig;
  onChange: (next: SceneConfig) => void;
};

/**
 * Development-only control surface for every tunable scene constant.
 *
 * Rendered by CityScene behind a NODE_ENV check, so none of this reaches
 * visitors or the production bundle. Styled with the site's own tokens
 * rather than pulling in a GUI library, so it sits in the page instead of
 * floating over it as a foreign dark panel.
 */
export function TuningPanel({ config, onChange }: TuningPanelProps) {
  const [open, setOpen] = useState(false);
  const [copiedGroup, setCopiedGroup] = useState<string | null>(null);
  /** Collapsed sections, by title. Only the first starts open, so the
   * panel opens as a short list of sections rather than a wall of
   * sliders. */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      CONTROL_GROUPS.map((group, index) => [group.title, index !== 0]),
    ),
  );

  function toggleGroup(title: string) {
    setCollapsed((previous) => ({ ...previous, [title]: !previous[title] }));
  }

  /** Restores just this section, leaving other sections as tuned. */
  function resetGroup(group: ControlGroup) {
    const next = { ...config };
    for (const control of group.controls) {
      // Key and value are drawn from the same shape, but TypeScript can't
      // correlate a union of keys with its matching union of value types.
      Object.assign(next, { [control.key]: DEFAULT_SCENE_CONFIG[control.key] });
    }
    onChange(next);
  }

  /** Copies just this section's values, ready to paste over the matching
   * block of DEFAULT_SCENE_CONFIG. */
  function copyGroup(group: ControlGroup) {
    const subset = Object.fromEntries(
      group.controls.map((control) => [control.key, config[control.key]]),
    );
    void navigator.clipboard?.writeText(JSON.stringify(subset, null, 2));
    setCopiedGroup(group.title);
    window.setTimeout(() => setCopiedGroup(null), 1200);
  }

  if (!open) {
    return (
      // Icon only, and built from the same parts as the download button
      // beside the search field: 44px circle, translucent surface, hairline
      // border, no shadow. It is a dev control, but it sits on the same
      // page as everything else and should not look bolted on.
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open scene tuning"
        title="Scene tuning"
        data-ui
        className="pointer-events-auto fixed right-3 top-3 z-50 grid size-11 sm:bottom-3 sm:top-auto place-items-center rounded-full border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] text-ink backdrop-blur-md transition-[background-color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-canvas-raised active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <SettingsIcon />
      </button>
    );
  }

  return (
    <div
      data-ui
      className="pointer-events-auto fixed right-3 top-3 z-50 flex max-h-[80vh] w-72 flex-col sm:bottom-3 sm:top-auto overflow-hidden rounded-xl border border-border bg-canvas-raised shadow-[var(--shadow-raised)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          Scene tuning
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close scene tuning"
          className="grid size-6 place-items-center rounded-md text-ink-muted hover:bg-ink/5"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="tune-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-3">
        {CONTROL_GROUPS.map((group) => (
        <fieldset key={group.title} className="mb-3 border-0 p-0">
          <legend className="mb-1 flex w-full items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => toggleGroup(group.title)}
              aria-expanded={!collapsed[group.title]}
              className="flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-ink hover:bg-ink/5"
            >
              <span
                aria-hidden="true"
                className="inline-block text-[9px] text-ink-subtle transition-transform duration-150"
                style={{
                  transform: collapsed[group.title]
                    ? "rotate(-90deg)"
                    : "rotate(0deg)",
                }}
              >
                &#9660;
              </span>
              {group.title}
            </button>
            {/* Only while the section is open: actions for controls you
                can't see are noise. */}
            {collapsed[group.title] ? null : (
              <span className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => copyGroup(group)}
                  title={`Copy ${group.title} values`}
                  aria-label={`Copy ${group.title} values`}
                  className="grid size-6 place-items-center rounded-md text-ink-muted hover:bg-ink/5"
                >
                  {copiedGroup === group.title ? (
                    <CheckIcon />
                  ) : (
                    <CopyIcon />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => resetGroup(group)}
                  title={`Reset ${group.title}`}
                  aria-label={`Reset ${group.title}`}
                  className="grid size-6 place-items-center rounded-md text-ink-muted hover:bg-ink/5"
                >
                  <ResetIcon />
                </button>
              </span>
            )}
          </legend>

          {collapsed[group.title]
            ? null
            : group.controls.map((control) =>
            control.kind === "toggle" ? (
              <Toggle
                key={control.key}
                label={control.label}
                hint={control.hint}
                value={config[control.key]}
                onChange={(value) => {
                  const next = { ...config };
                  Object.assign(next, { [control.key]: value });
                  onChange(next);
                }}
              />
            ) : control.kind === "choice" ? (
              <div key={control.key} className="mb-2">
                <span className="text-xs text-ink-muted">{control.label}</span>
                <div
                  role="tablist"
                  aria-label={control.label}
                  className="mt-1 flex gap-1 rounded-lg border border-border p-0.5"
                >
                  {control.options.map((option) => {
                    const active = config[control.key] === option.value;
                    return (
                      <button
                        key={String(option.value)}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          const next = { ...config };
                          // Key and value come from the same union member,
                          // but TypeScript can't correlate the two.
                          Object.assign(next, { [control.key]: option.value });
                          onChange(next);
                        }}
                        className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                          active
                            ? "bg-ink text-white"
                            : "text-ink-muted hover:bg-ink/5"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {control.hint ? (
                  <span className="text-[10px] text-ink-subtle">
                    {control.hint}
                  </span>
                ) : null}
              </div>
            ) : (
              <label key={control.key} className="mb-2 block">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-ink-muted">{control.label}</span>
                  <span className="text-xs tabular-nums text-ink">
                    {Number.isInteger(control.step)
                      ? config[control.key]
                      : config[control.key].toFixed(
                          String(control.step).split(".")[1]?.length ?? 2,
                        )}
                    {/* Muted, so the number stays the thing being read
                        and the unit is just there to name it. */}
                    {control.unit ? (
                      <span className="text-ink-subtle">{control.unit}</span>
                    ) : null}
                  </span>
                </span>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={config[control.key]}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      [control.key]: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full accent-[var(--color-ink)]"
                />
                {control.hint ? (
                  <span className="text-[10px] text-ink-subtle">
                    {control.hint}
                  </span>
                ) : null}
              </label>
              ),
              )}
        </fieldset>
        ))}
      </div>

      {/* Both whole-panel actions together, away from the per-section
          ones so the two scopes don't read as the same control. */}
      <div className="flex shrink-0 gap-1.5 border-t border-border/70 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_SCENE_CONFIG })}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-canvas"
        >
          Reset all
        </button>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(JSON.stringify(config, null, 2));
            setCopiedGroup("__all__");
            window.setTimeout(() => setCopiedGroup(null), 1200);
          }}
          className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink hover:bg-canvas"
        >
          {copiedGroup === "__all__" ? "Copied all" : "Copy all values"}
        </button>
      </div>
    </div>
  );
}
