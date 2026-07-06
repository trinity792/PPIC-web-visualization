/* eslint-disable react/prop-types */
import React from "react";
import { Orbitron, Source_Sans_3, Inter, Source_Serif_4 } from "next/font/google";
import Navbar from "@/components/Navbar";
import ReportProblemDialog from "@/components/feedback/ReportProblemDialog";
import BackToTopButton from "@/components/documents/BackToTopButton";
import { PAGE_LAYOUT } from "@/lib/constants";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["900"],
  variable: "--font-orbitron",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-source-sans",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-inter",
});

// Variable serif used globally. No pinned weight so the full variable range is
// available for the heading hierarchy.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
});

export const metadata = {
  title: "PPIC Data Explorer",
  description: "Interactive California population and housing data visualizations.",
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: some browser extensions inject attributes onto
    // <html> before React hydrates (e.g. content-filter "channel" data-* attrs),
    // which is otherwise reported as a hydration mismatch.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${orbitron.variable} ${sourceSans.variable} ${inter.variable} ${sourceSerif.variable}`}
    >
      <body
        className="font-body"
        style={{ "--page-max-width": PAGE_LAYOUT.maxWidth }}
      >
        <Navbar />
        {children}
        <div className="fixed right-4 bottom-4 z-40 flex items-center gap-2 sm:right-6 sm:bottom-6">
          <ReportProblemDialog />
          <BackToTopButton />
        </div>
        <Analytics />
      </body>
    </html>
  );
}
