"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const [username, setUsername] = useState<"david" | "gorjan">("david");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      router.push(next);
      router.refresh();
    } else {
      setError("Wrong password. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d1117" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold"
              style={{ background: "linear-gradient(135deg, #58a6ff, #3fb950)" }}>
              RL
            </div>
            <span className="text-xl font-semibold" style={{ color: "#e6edf3" }}>RefiLoop Hub</span>
          </div>
          <p style={{ color: "#8b949e" }} className="text-sm">David &amp; Gorjan collaboration workspace</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border p-6" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <h2 className="text-base font-semibold mb-5" style={{ color: "#e6edf3" }}>Sign in</h2>

          {/* User toggle */}
          <div className="flex gap-2 mb-4 p-1 rounded-lg" style={{ background: "#0d1117" }}>
            {(["david", "gorjan"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUsername(u)}
                className="flex-1 py-1.5 rounded-md text-sm font-medium transition-all"
                style={{
                  background: username === u ? (u === "david" ? "#1f6feb" : "#1a7f37") : "transparent",
                  color: username === u ? "#fff" : "#8b949e",
                }}
              >
                {u === "david" ? "David" : "Gorjan"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#8b949e" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full px-3 py-2 rounded-md text-sm outline-none transition-colors"
                style={{
                  background: "#0d1117",
                  border: "1px solid #30363d",
                  color: "#e6edf3",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#58a6ff")}
                onBlur={(e) => (e.target.style.borderColor = "#30363d")}
              />
            </div>
            {error && (
              <p className="text-xs" style={{ color: "#f85149" }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-md text-sm font-semibold transition-opacity"
              style={{
                background: username === "david" ? "#1f6feb" : "#1a7f37",
                color: "#fff",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
