import Image from "next/image";
import type { ContributionPeriod, GithubProfile } from "@/lib/contributions/types";

const numberFormatter = new Intl.NumberFormat("en-US");

/**
 * Who the city belongs to. Sits directly under the search form, since it
 * answers the same question the input asked, and reads as a caption
 * rather than a panel now that the surrounding card is gone.
 */
export function ProfileIdentity({ profile }: { profile: GithubProfile }) {
  return (
    <a
      href={profile.profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group mx-auto flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Image
        src={profile.avatarUrl}
        alt=""
        width={32}
        height={32}
        className="size-8 rounded-full border border-border bg-canvas-raised"
        unoptimized
      />
      <span className="text-sm font-semibold text-ink group-hover:underline">
        {profile.name ?? profile.login}
      </span>
      {profile.name ? (
        <span className="text-sm text-ink-muted">@{profile.login}</span>
      ) : null}
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
