import React from "react";
import localFont from "next/font/local";
import Navbar from "@/components/Navbar";
import ReportProblemDialog from "@/components/feedback/ReportProblemDialog";
import BackToTopButton from "@/components/documents/BackToTopButton";
import { PAGE_LAYOUT } from "@/lib/constants";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"

// The same Latin variable serif, retaining its full heading weight range.
const sourceSerif = localFont({
  src: "../public/fonts/SourceSerif4-latin.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  declarations: [{ prop: "font-family", value: "Source Serif 4" }],
  adjustFontFallback: "Times New Roman",
  variable: "--font-source-serif",
});

export const metadata = {
  title: "PPIC Interactive Visualization Tool",
  description: "Interactive California population and housing data visualizations.",
  // Files live in public/. The .ico is the fallback for browsers without SVG
  // favicon support; the SVG is listed last so capable browsers prefer it.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/ppic-starburst.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: some browser extensions inject attributes onto
    // <html> before React hydrates (e.g. content-filter "channel" data-* attrs),
    // which is otherwise reported as a hydration mismatch.
    <html
      lang="en"
      suppressHydrationWarning
      className={sourceSerif.variable}
    >
      <head>
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://use.typekit.net/oxl2ffg.css" />
      </head>
      <body
        className="font-body"
        style={{
          "--page-max-width": PAGE_LAYOUT.maxWidth,
          "--page-content-width": PAGE_LAYOUT.contentWidth,
        }}
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
