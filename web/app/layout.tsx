import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import PrintTheme from "@/components/PrintTheme";
import SiteNav from "@/components/SiteNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ScanDiff",
  description: "Tamper-evident evidence of condition at handoff, from 3D scans.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PrintTheme />
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
