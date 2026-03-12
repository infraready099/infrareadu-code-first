import Link from "next/link";

export const metadata = {
  title: "Pricing — InfraReady",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-6 py-24">
      <div className="max-w-md w-full text-center">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#71717a] mb-4">
          Pricing
        </p>
        <h1
          className="font-bold text-white mb-4"
          style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.03em" }}
        >
          Pricing is being finalized.
        </h1>
        <p className="text-[#a1a1aa] text-base leading-relaxed mb-8">
          Join the waitlist to get founder pricing — locked in before we launch publicly.
        </p>
        <Link
          href="/#waitlist"
          className="inline-flex items-center px-6 py-3 rounded-md font-semibold text-white text-sm bg-[#f97316] hover:bg-orange-400 transition-colors duration-200"
        >
          Join the waitlist
        </Link>
        <div className="mt-6">
          <Link href="/" className="text-sm text-[#52525b] hover:text-[#a1a1aa] transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
