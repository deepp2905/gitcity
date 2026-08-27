import Image from "next/image";
import type { ContributionPeriod, GithubProfile } from "@/lib/contributions/types";

const numberFormatter = new Intl.NumberFormat("en-US");

/**
 * Who the city belongs to. Sits at the left of the controls row, sharing
 * the pill treatment of the tabs and toggle beside it.
 */
export function ProfileIdentity({ profile }: { profile: GithubProfile }) {
  return (
    <a
      href={profile.profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-11 items-center gap-2 rounded-full border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] py-1 pl-1 pr-3.5 shadow-[var(--shadow-soft)] backdrop-blur-md transition-[background-color,color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-canvas-raised active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Image
        src={profile.avatarUrl}
        alt=""
        width={32}
        height={32}
        className="size-8 rounded-full bg-canvas-raised outline outline-1 -outline-offset-1 outline-black/10"
        unoptimized
      />
      {/* Username only. The display name added a second, variable-width
          label to a row of otherwise compact pills. */}
      <span className="text-sm font-medium text-ink group-hover:underline">
        @{profile.login}
      </span>
    </a>
  );
}

/**
 * The selected period's total. Lives with the period tabs rather than the
 * identity, because it changes whenever the tab does.
 */
export function PeriodTotal({ period }: { period: ContributionPeriod }) {
  return (
    <p className="text-sm text-ink-muted">
      <span className="font-semibold tabular-nums text-ink">
        {numberFormatter.format(period.totalContributions)}
      </span>{" "}
      contributions in {period.label.toLowerCase()}
    </p>
  );
}
