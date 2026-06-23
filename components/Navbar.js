"use client";

import Link from "next/link";
import { COLORS } from "@/lib/constants";

const logoStyle = {
  color: COLORS.white,
  fontSize: "2.5rem",
  fontWeight: 900,
  letterSpacing: "0.08em",
  textDecoration: "none",
};

export default function Navbar() {
  return (
    <nav style={{ backgroundColor: COLORS.primaryOrange }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 40px 8px 40px",
        }}
      >
        {/* Left: Logo + Org Name */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <Link
            href="/"
            className="font-orbitron"
            style={logoStyle}
          >
            PPIC
          </Link>

          <div
            style={{
              width: "1px",
              height: "50px",
              backgroundColor: "rgba(255,255,255,0.5)",
              marginLeft: "8px",
              marginRight: "8px",
            }}
          />

          <div
            className="font-source-sans"
            style={{
              color: COLORS.white,
              letterSpacing: "0.08em",
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontSize: "1.1rem" }}>PUBLIC POLICY</div>
            <div style={{ fontSize: "1.1rem" }}>
              INSTITUTE{" "}
              <span style={{ fontSize: "0.85rem" }}>OF</span>{" "}
              CALIFORNIA
            </div>
          </div>
        </div>

        {/* Right: Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: COLORS.white,
            borderRadius: "2px",
            padding: "6px 12px",
            minWidth: "200px",
          }}
        >
          <input
            type="text"
            placeholder="Search"
            style={{
              border: "none",
              outline: "none",
              flex: 1,
              fontSize: "0.95rem",
              color: "#333",
            }}
          />
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#999"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "8px 40px 12px 40px",
          gap: "40px",
        }}
      >
        <Link
          href="/population"
          className="font-inter"
          style={{
            color: COLORS.white,
            textDecoration: "none",
            fontSize: "0.9rem",
            letterSpacing: "0.03em",
          }}
        >
          Population Demographics
        </Link>
        <Link
          href="/housing"
          className="font-inter"
          style={{
            color: COLORS.white,
            textDecoration: "none",
            fontSize: "0.9rem",
            letterSpacing: "0.03em",
          }}
        >
          Housing Information
        </Link>
      </div>
    </nav>
  );
}
