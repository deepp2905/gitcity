"use client";

import { useId, useState, type FormEvent } from "react";
import { parseUsernameInput } from "@/lib/username/parse";
import type { UsernameParseFailureReason } from "@/lib/username/parse";

const CLIENT_VALIDATION_MESSAGES: Record<UsernameParseFailureReason, string> = {
  empty: "Enter a GitHub username or profile URL.",
  "invalid-syntax": "That doesn't look like a valid GitHub username or URL.",
  "invalid-host": "Only github.com usernames and URLs are supported.",
  reserved: "That username is reserved by GitHub and can't belong to a user.",
};

type SearchFormProps = {
  /** Current username from the URL, used to seed the field on load. */
  initialValue?: string;
  isLoading: boolean;
  onSubmit: (username: string) => void;
};

export function SearchForm({
  initialValue = "",
  isLoading,
  onSubmit,
}: SearchFormProps) {
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Validate with the same parser the API uses, so obvious mistakes get
    // instant feedback without a round trip.
    const parsed = parseUsernameInput(value);
    if (!parsed.ok) {
      setError(CLIENT_VALIDATION_MESSAGES[parsed.reason]);
      return;
    }

    setError(null);
    onSubmit(parsed.username);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full max-w-md">
      {/*
        Visually replaced by the placeholder, but kept in the accessible
        tree: a placeholder alone vanishes as soon as the user types, so
        it can't be the only label.
      */}
      <label htmlFor={inputId} className="sr-only">
        GitHub username or URL
      </label>

      {/* min-w-0 on the input below: a flex item defaults to
          min-width:auto and will not shrink past its intrinsic width, so
          the field pushed the submit button off the side of the form's
          own max-width. */}
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          name="user"
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder="GitHub username or URL"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-h-11 w-full min-w-0 flex-1 rounded-full border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] px-5 text-base text-ink shadow-[var(--shadow-soft)] outline-none backdrop-blur-md transition-colors placeholder:text-ink-subtle focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 aria-[invalid]:border-danger"
        />

        {/*
          Icon only, so the accessible name has to come from aria-label.
          A square button at the field's own height reads as part of the
          same control rather than as a second, competing one.
        */}
        <button
          type="submit"
          disabled={isLoading}
          aria-label={isLoading ? "Loading contributions" : "View contributions"}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-white shadow-[var(--shadow-soft)] transition-[background-color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-ink/85 active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          {isLoading ? <Spinner /> : <ArrowRight />}
        </button>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function ArrowRight() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

/** Spins via CSS, so it keeps turning without a frame loop. */
function Spinner() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-5 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="10" cy="10" r="7" className="opacity-30" />
      <path d="M17 10a7 7 0 0 0-7-7" />
    </svg>
  );
}
