import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "RefiLoop Hub",
  description: "RefiLoop collaboration hub for David & Gorjan",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = getCurrentUser();

  return (
    <html lang="en">
      <body>
        {user ? (
          <AppShell user={user}>{children}</AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
