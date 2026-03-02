import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "InfraReady", template: "%s | InfraReady" },
  description: "One-click AWS infrastructure for solo founders. Your own account. Your own code.",
  metadataBase: new URL("https://infraready.io"),
  openGraph: {
    title: "InfraReady — One-click AWS infrastructure",
    description: "Deploy production AWS infrastructure in 20 minutes. No DevOps. No Kubernetes.",
    url: "https://infraready.io",
    siteName: "InfraReady",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
