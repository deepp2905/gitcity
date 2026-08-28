"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { parseUsernameInput } from "@/lib/username/parse";
import type { UsernameParseFailureReason } from "@/lib/username/parse";
import { useHasFinePointer } from "@/lib/hooks/use-media-query";

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
  /** True only while the field is the visible occupant of its slot. */
  shouldFocus?: boolean;
  onSubmit: (username: string) => void;
};

export function SearchForm({
  initialValue = "",
  isLoading,
  shouldFocus = false,
  onSubmit,
}: SearchFormProps) {
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFinePointer = useHasFinePointer();

  /**
   * Focus on load, so the page can be typed into without a click.
   *
   * Deliberately not on touch. Focusing a field there raises the
   * keyboard, which would cover most of the city on arrival — and the
   * city is the thing worth seeing first. `useHasFinePointer` is false
   * during SSR and on the first client render, so this never fires on a
   * phone even briefly.
   *
   * Guarded on visibility too: the field is still mounted while hidden
   * behind the controls, and focusing an invisible input would scroll to
   * it and trap the caret somewhere nobody can see.
   */
  useEffect(() => {
    if (!shouldFocus || !hasFinePointer) return;
    inputRef.current?.focus();
  }, [shouldFocus, hasFinePointer]);

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
          ref={inputRef}
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
          className="h-11 w-full min-w-0 flex-1 rounded-full border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] px-5 text-base text-ink outline-none backdrop-blur-md transition-colors placeholder:text-ink-subtle focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/15 aria-[invalid]:border-danger"
        />

        {/*
          Icon only, so the accessible name has to come from aria-label.
          A square button at the field's own height reads as part of the
          same control rather than as a second, competing one.

          It goes quiet while a search runs rather than showing a
          spinner: the city is already the loading indicator, running the
          wave across the whole screen, and a second one in the corner
          says the same thing twice.
        */}
        <button
          type="submit"
          disabled={isLoading}
          aria-label={isLoading ? "Loading contributions" : "View contributions"}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-white transition-[background-color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-ink/85 active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          <ArrowRight />
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
