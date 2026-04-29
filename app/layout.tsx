import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RefiLoop Hub",
  description: "RefiLoop collaboration hub for David & Gorjan",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
