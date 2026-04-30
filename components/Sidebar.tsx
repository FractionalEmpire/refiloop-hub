"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "⊞" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/projects", label: "Projects", icon: "◈" },
  { href: "/eod", label: "EOD Updates", icon: "📋" },
  { href: "/docs", label: "Docs", icon: "📄" },
  { href: "/filters", label: "Filters", icon: "⚙️" },
  { href: "/context", label: "Business Context", icon: "🏢" },
];

export default function Sidebar({ user }: { user: "david" | "gorjan" }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const userColor = user === "david" ? "#58a6ff" : "#3fb950";
  const userName = user === "david" ? "David" : "Gorjan";

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-56 flex flex-col z-10"
      style={{ background: "#161b22", borderRight: "1px solid #30363d" }}
    >
      {/* Logo */}
      <div className="p-4 border-b" style={{ borderColor: "#30363d" }}>
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: "linear-gradient(135deg, #58a6ff, #3fb950)" }}
          >
            RL
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "#e6edf3" }}>RefiLoop</div>
            <div className="text-xs" style={{ color: "#8b949e" }}>Hub</div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
              style={{
                background: active ? "#21262d" : "transparent",
                color: active ? "#e6edf3" : "#8b949e",
              }}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* External links */}
      <div className="px-3 pb-2">
        <div className="text-xs font-medium mb-1.5 px-3" style={{ color: "#484f58" }}>QUICK LINKS</div>
        {[
          { label: "skip-trace-ui", href: "https://skip-trace-ui.vercel.app/skip-trace" },
          { label: "Supabase", href: "https://supabase.com/dashboard/project/dxvanitpqvvxvroywdml" },
          { label: "GitHub", href: "https://github.com/FractionalEmpire/refiloop-config" },
          { label: "refiloop.com", href: "https://refiloop.com" },
        ].map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors"
            style={{ color: "#8b949e" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#e6edf3")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#8b949e")}
          >
            ↗ {l.label}
          </a>
        ))}
      </div>

      {/* User */}
      <div className="p-3 border-t" style={{ borderColor: "#30363d" }}>
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-md"
          style={{ background: "#21262d" }}>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: userColor, color: "#000" }}
          >
            {userName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate" style={{ color: "#e6edf3" }}>{userName}</div>
            <div className="text-xs truncate" style={{ color: "#8b949e" }}>RefiLoop</div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs shrink-0 transition-colors"
            style={{ color: "#484f58" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#f85149")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#484f58")}
          