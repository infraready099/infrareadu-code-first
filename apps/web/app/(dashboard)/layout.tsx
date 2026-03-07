import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { LayoutDashboard, Layers, Settings, LogOut, Zap } from "lucide-react";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Preserve the intended destination so post-login the user lands on the right page
    const headersList = await headers();
    const nextPath = headersList.get("x-pathname") ?? "/projects/new";
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 border-r border-gray-800 flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-gray-800">
          <Link href="/projects" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-sky-500 rounded-md flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white tracking-tight">InfraReady</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavItem href="/projects" icon={<LayoutDashboard className="w-4 h-4" />} label="Projects" />
          <NavItem href="/deployments" icon={<Layers className="w-4 h-4" />} label="Deployments" />
          <NavItem href="/settings" icon={<Settings className="w-4 h-4" />} label="Settings" />
        </nav>

        {/* User */}
        <div className="p-3 border-t border-gray-800">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-800 cursor-pointer">
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="Avatar"
                className="w-7 h-7 rounded-full"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-xs font-semibold">
                {user.email?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {user.user_metadata?.user_name || user.email}
              </p>
              <p className="text-xs text-gray-500 truncate">Free plan</p>
            </div>
          </div>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-2 py-2 mt-1 text-sm text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-2 py-2 text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded-lg transition-colors"
    >
      {icon}
      {label}
    </Link>
  );
}
