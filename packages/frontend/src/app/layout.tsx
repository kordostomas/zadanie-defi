import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GymFinder Loyalty dApp",
  description: "DMBLOCK Assignment 2 — GymFinder Loyalty System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
