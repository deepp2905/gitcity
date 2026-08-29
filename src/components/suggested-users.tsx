"use client";

/**
 * A few accounts worth looking at, under the search field.
 *
 * An empty field is a worse first impression than any city: it asks for
 * something the visitor may not have — a GitHub username they care about
 * — before showing what the thing does with one. These give the idle
 * state somewhere to go in a single tap.
 */
type Suggestion = {
  login: string;
  /** Hidden below the sm breakpoint, where the row runs out of width. */
  wideOnly?: boolean;
};

const SUGGESTED_LOGINS: Suggestion[] = [
  { login: "lochie" },
  { login: "joshpuckett" },
  { login: "raunofreiberg" },
  // Four names are wider than a phone. Dropped below sm rather than
  // wrapped: a second line here would push the row into the city.
  { login: "benjitaylor", wideOnly: true },
];

type SuggestedUsersProps = {
  onSelect: (username: string) => void;
};

export function SuggestedUsers({ onSelect }: SuggestedUsersProps) {
  return (
    // pl-2.5 cancels the buttons' own px-2.5 against the field's px-5,
    // so the first login's text starts on the same vertical as the
    // placeholder above it rather than 10px inside it.
    <ul className="flex flex-wrap items-center justify-start gap-1 pl-2.5">
      {SUGGESTED_LOGINS.map(({ login, wideOnly }) => (
        <li key={login} className={wideOnly ? "hidden sm:block" : undefined}>
          <button
            type="button"
            onClick={() => onSelect(login)}
            // Taller than the text needs, so it is a real tap target on a
            // phone rather than a 16px line of type to aim at. Quiet at
            // rest: these are an offer, not the primary action, and the
            // field beside them is what most people came to use.
            className="flex h-8 items-center rounded-full px-2.5 text-xs font-medium text-ink-subtle transition-[background-color,color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-ink/5 hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            @{login}
          </button>
        </li>
      ))}
    </ul>
  );
}
