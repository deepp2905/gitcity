"use client";

import { useState, type RefObject } from "react";
import type { ContributionPeriod, GithubProfile } from "@/lib/contributions/types";
import {
  EXPORT_PIXEL_RATIO,
  canvasToBlob,
  composeCityPng,
  downloadBlob,
  exportFilename,
  loadCrossOriginImage,
} from "@/lib/export/png";

type DownloadButtonProps = {
  profile: GithubProfile;
  period: ContributionPeriod;
  /** Populated by the scene once its renderer exists. */
  captureRef: RefObject<(() => HTMLCanvasElement | null) | null>;
};

/**
 * Saves the city as a PNG: the scene as rendered, plus a wordmark and an
 * identity pill. No labels — see src/lib/export/png.ts.
 *
 * It captures whatever state is on screen. Flat gives the chart, tilted
 * gives the city, and both are worth having — a button that is always
 * there has to do the obvious thing rather than silently exporting a
 * view nobody is looking at.
 */
export function DownloadButton({
  profile,
  period,
  captureRef,
}: DownloadButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const capture = captureRef.current;
    if (!capture || busy) return;

    setBusy(true);
    try {
      // The avatar first: fetching it after the snapshot would leave a
      // gap in which the scene could animate out from under the image.
      const avatar = await loadCrossOriginImage(profile.avatarUrl);

      const scene = capture();
      if (!scene) return;

      const composed = composeCityPng(
        scene,
        profile.login,
        avatar,
        EXPORT_PIXEL_RATIO,
      );
      const blob = await canvasToBlob(composed);
      if (!blob) return;

      downloadBlob(blob, exportFilename(profile.login, period.label));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={busy ? "Saving PNG" : "Download as PNG"}
      title="Download as PNG"
      className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] text-ink backdrop-blur-md transition-[background-color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-canvas-raised active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-progress disabled:opacity-60 disabled:active:scale-100"
    >
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 15.5h12" />
      </svg>
    </button>
  );
}
