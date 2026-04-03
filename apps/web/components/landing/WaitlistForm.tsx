"use client";

import { useState } from "react";
import { usePostHog } from "posthog-js/react";

type FormState = "idle" | "loading" | "success" | "error";

export function WaitlistForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [nameError, setNameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const posthog = usePostHog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    let hasError = false;
    if (!trimmedName) {
      setNameError(true);
      hasError = true;
    } else {
      setNameError(false);
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setEmailError(true);
      hasError = true;
    } else {
      setEmailError(false);
    }

    if (hasError) return;

    setState("loading");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, email: trimmedEmail }),
      });

      if (!res.ok && res.status !== 409) {
        setState("error");
        return;
      }

      setState("success");
      posthog?.capture("waitlist_submitted", {
        email_domain: trimmedEmail.split("@")[1],
      });
    } catch {
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#00E5FF]/10 border border-[#00E5FF]/20 mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-white font-semibold text-lg mb-2">
          You&apos;re on the list.
        </p>
        <p className="text-[#a1a1aa] text-sm">
          We&apos;ll be in touch within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full max-w-md mx-auto">
      <div className="space-y-3">
        {/* Name */}
        <div>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(false);
            }}
            className={`w-full px-4 py-3 rounded-md bg-[#111111] text-white placeholder-[#52525b] text-sm outline-none transition-colors duration-150 ${
              nameError
                ? "border-2 border-red-500"
                : "border border-[#27272a] focus:border-[#f97316]"
            }`}
          />
          {nameError && (
            <p className="text-red-400 text-xs mt-1.5">Name is required.</p>
          )}
        </div>

        {/* Email */}
        <div>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(false);
            }}
            className={`w-full px-4 py-3 rounded-md bg-[#111111] text-white placeholder-[#52525b] text-sm outline-none transition-colors duration-150 ${
              emailError
                ? "border-2 border-red-500"
                : "border border-[#27272a] focus:border-[#f97316]"
            }`}
          />
          {emailError && (
            <p className="text-red-400 text-xs mt-1.5">A valid email is required.</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={state === "loading"}
          className="w-full px-6 py-3 rounded-md font-semibold text-white text-sm bg-[#f97316] hover:bg-orange-400 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {state === "loading" ? (
            <>
              <svg
                className="animate-spin w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Submitting...
            </>
          ) : (
            "Get Early Access"
          )}
        </button>
      </div>

      {state === "error" && (
        <p className="text-red-400 text-sm mt-3 text-center">
          Something went wrong. Email us directly at{" "}
          <a href="mailto:hello@infraready.io" className="underline">
            hello@infraready.io
          </a>
        </p>
      )}

      <p className="text-[#52525b] text-xs text-center mt-3">
        No spam. Just a real conversation about your infrastructure.
      </p>
    </form>
  );
}
