import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-num", display: "swap" });

export const metadata = { title: "Prospect Decision Radar", description: "Find, research and decide on workspace prospects." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
