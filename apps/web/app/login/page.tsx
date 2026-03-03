import { Zap } from "lucide-react";
import { Metadata } from "next";
import LoginButton from "./login-button";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const hasError = searchParams.error === "auth";

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-sky-500 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-semibold text-white tracking-tight">InfraReady</span>
        </div>

        {/* Card */}
        <div className="card">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-white mb-2">
              Deploy your app to AWS in 20 minutes
            </h1>
            <p className="text-sm text-gray-400">
              Connect your GitHub to get started. No DevOps required.
            </p>
          </div>

          {/* Auth error */}
          {hasError && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-900/30 border border-red-800/50 text-sm text-red-400">
              Authentication failed. Please try again.
            </div>
          )}

          {/* GitHub OAuth button — client component handles the call */}
          <LoginButton />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-600 mt-6">
          By signing in you agree to our{" "}
          <a href="/terms" className="text-gray-500 hover:text-gray-400 underline underline-offset-2">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" className="text-gray-500 hover:text-gray-400 underline underline-offset-2">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
