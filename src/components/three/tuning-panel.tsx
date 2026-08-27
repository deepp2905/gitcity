"use client";

import { useState } from "react";
import {
  CONTROL_GROUPS,
  DEFAULT_SCENE_CONFIG,
  type ControlGroup,
  type SceneConfig,
} from "@/lib/three/config";

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto fixed bottom-3 right-3 z-50 min-h-11 rounded-lg border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] px-3 text-xs font-medium text-ink shadow-[var(--shadow-soft)] backdrop-blur-md hover:bg-canvas-raised"
      >
        Tune scene
      </button>
    );
  }

  return (
    <div className="pointer-events-auto fixed bottom-3 right-3 z-50 max-h-[80vh] w-72 overflow-y-auto rounded-xl border border-border bg-canvas-raised p-3 shadow-[var(--shadow-raised)]">
      <div className="mb-2 flex items-center justify-between gap-2">
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
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-ink-muted hover:bg-ink/5"
                >
                  {copiedGroup === group.title ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => resetGroup(group)}
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-ink-muted hover:bg-ink/5"
                >
                  Reset
                </button>
              </span>
            )}
          </legend>

          {collapsed[group.title]
            ? null
            : group.controls.map((control) =>
            control.kind === "choice" ? (
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
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() =>
                          onChange({ ...config, [control.key]: option.value })
                        }
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
                  className="mt-1 w-full accent-[var(--color-accent)]"
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

      {/* Both whole-panel actions together, away from the per-section
          ones so the two scopes don't read as the same control. */}
      <div className="flex gap-1.5">
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
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_SCENE_CONFIG })}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-canvas"
        >
          Reset all
        </button>
      </div>
    </div>
  );
}
