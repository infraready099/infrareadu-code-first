import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { LayoutDashboard, Layers, Settings, LogOut, Zap, Store } from "lucide-react";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Preserve the intended destination so post-login the user lands on the right page
    const headersList = await headers();
    const nextPath = headersList.get("x-pathname") ?? "/projects/new";
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const displayName = user.user_metadata?.user_name || user.email?.split("@")[0] || "User";
  const avatarUrl   = user.user_metadata?.avatar_url as string | undefined;
  const initials    = displayName[0]?.toUpperCase() ?? "U";

  return (
    <div className="flex h-screen" style={{ background: "#0a0a0a" }}>
      {/* Sidebar */}
      <aside
        className="w-56 flex flex-col shrink-0"
        style={{
          background: "#0a0a0a",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Logo */}
        <div
          className="h-14 flex items-center px-4 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Link href="/projects" className="flex items-center gap-2.5 group">
            {/* Gradient icon */}
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                boxShadow: "0 0 16px rgba(249,115,22,0.35)",
              }}
            >
              <Zap className="w-3.5 h-3.5 text-white" fill="currentColor" />
            </div>
            <span
              className="font-semibold tracking-tight text-sm"
              style={{ color: "#F0F9FF" }}
            >
              InfraReady
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <NavItem href="/projects"    icon={<LayoutDashboard className="w-4 h-4" />} label="Projects" />
          <NavItem href="/templates"   icon={<Store className="w-4 h-4" />}            label="App Marketplace" />
          <NavItem href="/deployments" icon={<Layers className="w-4 h-4" />}          label="Deployments" />
          <NavItem href="/settings"    icon={<Settings className="w-4 h-4" />}         label="Settings" />
        </nav>

        {/* User area */}
        <div
          className="p-2 shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {/* Avatar + name */}
          <div
            className="flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors duration-150"
            style={{ cursor: "default" }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-7 h-7 rounded-full shrink-0"
                style={{ outline: "1px solid rgba(255,255,255,0.1)" }}
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  color: "#fff",
                }}
              >
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium truncate leading-tight"
                style={{ color: "#E2E8F0" }}
              >
                {displayName}
              </p>
              <p className="text-[10px] truncate leading-tight" style={{ color: "#475569" }}>
                Free plan
              </p>
            </div>
          </div>

          {/* Sign out */}
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto" style={{ background: "#0a0a0a" }}>
        {children}
      </main>
    </div>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2 py-2 text-sm rounded-lg transition-colors duration-150 group"
      style={{ color: "#64748B" }}
    >
      <span className="transition-colors duration-150">{icon}</span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}
