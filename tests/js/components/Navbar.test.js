import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Navbar from "@/components/Navbar";

describe("Navbar", () => {
  it("provides logo and Home links to the landing page", () => {
    render(<Navbar />);

    expect(screen.getByRole("link", { name: "PPIC home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
