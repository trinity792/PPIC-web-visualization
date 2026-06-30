/* eslint-disable react/prop-types */
import React from "react";
import { Orbitron, Source_Sans_3, Inter } from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";

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

export const metadata = {
  title: "PPIC Data Explorer",
  description: "Interactive California population and housing data visualizations.",
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: some browser extensions inject attributes onto
    // <html> before React hydrates (e.g. content-filter "channel" data-* attrs),
    // which is otherwise reported as a hydration mismatch.
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${orbitron.variable} ${sourceSans.variable} ${inter.variable} font-body`}
      >
        <Navbar />
        {children}
      </body>
    </html>
  );
}
