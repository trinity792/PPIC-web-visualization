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
  title: "CA Housing & Population Data",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${orbitron.variable} ${sourceSans.variable} ${inter.variable}`}
      >
        <Navbar />
        {children}
      </body>
    </html>
  );
}
