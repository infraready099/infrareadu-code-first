"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init("phc_za0dUwHbIfujv2nHnFVHKDXctGfoJDBczLzjYqlxfPf", {
      api_host: "https://us.i.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
      session_recording: { maskAllInputs: false },
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
