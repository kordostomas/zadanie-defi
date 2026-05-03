import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/lib/WalletContext";

const branchName = process.env.NEXT_PUBLIC_BRANCH_NAME ?? "GymFinder";

export const metadata: Metadata = {
  title: `${branchName} — Loyalty`,
  description: `${branchName} member loyalty portal`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
