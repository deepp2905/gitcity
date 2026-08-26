/**
 * GitHub top-level route names that can never be a username, because they
 * are reserved by github.com itself (github.com/settings is the Settings
 * page, not a user profile, etc).
 *
 * Not exhaustive of every route GitHub has ever shipped — GitHub does not
 * publish an authoritative list — but it covers the well-known top-level
 * paths so obviously-reserved input is rejected before we ever call the API.
 * Comparison is case-insensitive.
 */
export const RESERVED_GITHUB_USERNAMES: ReadonlySet<string> = new Set(
  [
    "about",
    "account",
    "admin",
    "administrator",
    "apps",
    "billing",
    "blog",
    "collections",
    "contact",
    "customer-stories",
    "dashboard",
    "download",
    "downloads",
    "enterprise",
    "events",
    "explore",
    "features",
    "gist",
    "gists",
    "help",
    "home",
    "integrations",
    "issues",
    "join",
    "login",
    "logout",
    "marketplace",
    "new",
    "newsletter",
    "nonprofit",
    "notifications",
    "orgs",
    "organizations",
    "pricing",
    "pulls",
    "readme",
    "search",
    "security",
    "settings",
    "site",
    "sitemap",
    "sponsors",
    "stars",
    "starred",
    "status",
    "styleguide",
    "support",
    "team",
    "teams",
    "topics",
    "trending",
    "watching",
  ].map((name) => name.toLowerCase()),
);

export function isReservedGithubUsername(username: string): boolean {
  return RESERVED_GITHUB_USERNAMES.has(username.toLowerCase());
}
