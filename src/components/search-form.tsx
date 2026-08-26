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

      <div className="flex flex-col gap-3 sm:flex-row">
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
          className="min-h-11 flex-1 rounded-lg border border-border bg-canvas-raised px-3.5 text-base text-ink shadow-sm outline-none transition-colors placeholder:text-ink-subtle focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 aria-[invalid]:border-danger"
        />

        <button
          type="submit"
          disabled={isLoading}
          className="min-h-11 shrink-0 rounded-lg bg-accent px-5 text-base font-medium text-white shadow-sm transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Loading…" : "View contributions"}
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
