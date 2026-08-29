import Image from "next/image";
import type { ContributionPeriod, GithubProfile } from "@/lib/contributions/types";

const numberFormatter = new Intl.NumberFormat("en-US");

/**
 * Who the city belongs to. Sits at the left of the controls row, sharing
 * the pill treatment of the tabs and toggle beside it.
 */
export function ProfileIdentity({ profile }: { profile: GithubProfile }) {
  return (
    // No underline on hover: the pill already answers with its own fill
    // and press, and a rule under the username inside a filled control
    // reads as a second, competing affordance.
    <a
      href={profile.profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      // Named on the link, not on the image or the span: the span is
      // display:none below sm, which takes it out of the accessible tree
      // and would leave the link nameless on a phone.
      aria-label={`@${profile.login} on GitHub`}
      // A bare avatar on a phone: three controls plus a variable-width
      // username do not fit a narrow row, and the username is the one
      // whose absence costs least — whoever searched already knows whose
      // city they are looking at.
      className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] p-1 backdrop-blur-md transition-[background-color,color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-canvas-raised active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:w-auto sm:justify-start sm:pr-3.5"
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
          label to a row of otherwise compact pills.

          Hidden below sm, where the avatar carries the identity on its
          own. `display: none` rather than a width transition, so it stops
          being a flex item and takes the gap with it. */}
      <span className="hidden text-sm font-medium text-ink sm:inline">
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
