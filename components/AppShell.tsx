import Sidebar from "./Sidebar";

export default function AppShell({
  user,
  children,
}: {
  user: "david" | "gorjan";
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen" style={{ background: "#0d1117" }}>
      <Sidebar user={user} />
      <main className="flex-1 ml-56 min-h-screen">{children}</main>
    </div>
  );
}
