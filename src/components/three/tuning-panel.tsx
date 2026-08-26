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

  function set(key: keyof SceneConfig, value: number) {
    onChange({ ...config, [key]: value });
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
        className="fixed bottom-3 right-3 z-50 min-h-11 rounded-lg border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] px-3 text-xs font-medium text-ink shadow-[var(--shadow-soft)] backdrop-blur-md hover:bg-canvas-raised"
      >
        Tune scene
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 max-h-[80vh] w-72 overflow-y-auto rounded-xl border border-border bg-canvas-raised p-3 shadow-[var(--shadow-raised)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          Scene tuning
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_SCENE_CONFIG })}
            className="rounded-md px-2 py-1 text-xs font-medium text-ink-muted hover:bg-ink/5"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-2 py-1 text-xs font-medium text-ink-muted hover:bg-ink/5"
          >
            Close
          </button>
        </div>
      </div>

      {CONTROL_GROUPS.map((group) => (
        <fieldset key={group.title} className="mb-3 border-0 p-0">
          <legend className="mb-1 flex w-full items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink">{group.title}</span>
            <button
              type="button"
              onClick={() => copyGroup(group)}
              className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-ink-muted hover:bg-ink/5"
            >
              {copiedGroup === group.title ? "Copied" : "Copy"}
            </button>
          </legend>

          {group.controls.map((control) => {
            const value = config[control.key];
            return (
              <label key={control.key} className="mb-2 block">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-ink-muted">{control.label}</span>
                  <span className="text-xs tabular-nums text-ink">
                    {Number.isInteger(control.step)
                      ? value
                      : value.toFixed(String(control.step).split(".")[1]?.length ?? 2)}
                  </span>
                </span>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={value}
                  onChange={(event) =>
                    set(control.key, Number(event.target.value))
                  }
                  className="mt-1 w-full accent-[var(--color-accent)]"
                />
                {control.hint ? (
                  <span className="text-[10px] text-ink-subtle">
                    {control.hint}
                  </span>
                ) : null}
              </label>
            );
          })}
        </fieldset>
      ))}

      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(JSON.stringify(config, null, 2));
          setCopiedGroup("__all__");
          window.setTimeout(() => setCopiedGroup(null), 1200);
        }}
        className="w-full rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink hover:bg-canvas"
      >
        {copiedGroup === "__all__" ? "Copied all" : "Copy all values"}
      </button>
    </div>
  );
}
