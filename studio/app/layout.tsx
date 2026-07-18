import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "myvideo_ Studio",
  description: "Local-first AI-assisted video production cockpit",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
