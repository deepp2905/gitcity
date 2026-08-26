import Image from "next/image";
import type { ContributionPeriod, GithubProfile } from "@/lib/contributions/types";

type ProfileHeaderProps = {
  profile: GithubProfile;
  period: ContributionPeriod;
};

const numberFormatter = new Intl.NumberFormat("en-US");

export function ProfileHeader({ profile, period }: ProfileHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Image
        src={profile.avatarUrl}
        alt=""
        width={48}
        height={48}
        className="size-12 rounded-full border border-border bg-canvas-raised"
        unoptimized
      />

      <div className="min-w-0">
        <a
          href={profile.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-base font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {profile.name ?? profile.login}
        </a>
        {profile.name ? (
          <p className="text-sm text-ink-muted">@{profile.login}</p>
        ) : null}
      </div>

      <p className="ml-auto text-sm text-ink-muted">
        <span className="font-semibold tabular-nums text-ink">
          {numberFormatter.format(period.totalContributions)}
        </span>{" "}
        contributions in {period.label.toLowerCase()}
      </p>
    </div>
  );
}
