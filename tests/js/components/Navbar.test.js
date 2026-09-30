import React from "react";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Navbar from "@/components/Navbar";

describe("Navbar", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }));
  });
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

  it("lists every topic in the Topic menu", () => {
    render(<Navbar />);

    fireEvent.click(screen.getByRole("button", { name: "Topic" }));
    const topicMenu = screen.getByRole("menu", { name: "Topic" });

    expect(
      within(topicMenu)
        .getAllByRole("menuitem")
        .map((link) => link.textContent),
    ).toEqual([
      "Population & Housing",
      "Components of Change",
      "Age, Sex & Race Projections",
      "ACS Housing Stress",
      "Building Permits",
      "RHNA Progress Report",
    ]);
  });

  it("routes every topic to its module editor", () => {
    render(<Navbar />);

    fireEvent.click(screen.getByRole("button", { name: "Topic" }));
    const topicMenu = screen.getByRole("menu", { name: "Topic" });

    expect(
      within(topicMenu)
        .getAllByRole("menuitem")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/pophousing",
      "/components-of-change",
      "/demographic-projections",
      "/housing-stress",
      "/building-permits",
      "/rhna-progress",
    ]);
  });

  it("keeps the non-topic links", () => {
    render(<Navbar />);

    for (const [label, href] of [
      ["Custom visualizations", "/visualization-tool"],
      ["Documents", "/documents"],
      ["Logs", "/logs"],
      ["UI Kit", "/ui-kit"],
    ]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href,
      );
    }
  });

  it("opens topics on hover and closes on Escape with focus restored", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    const trigger = screen.getByRole("button", { name: "Topic" });
    expect(screen.queryByRole("menu", { name: "Topic" })).not.toBeInTheDocument();
    await user.hover(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const item = screen.getByRole("menuitem", { name: "Population & Housing" });
    item.focus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu", { name: "Topic" })).not.toBeInTheDocument();
  });

  it("keeps search visible, filters local destinations, and dismisses results with Escape", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    const input = screen.getByRole("searchbox", { name: "Search topics, pages, and documents" });
    expect(input).toHaveAttribute("placeholder", "Search");
    expect(screen.getByRole("button", { name: "Search", exact: true })).toBeInTheDocument();
    await user.type(input, "housing");
    const results = screen.getByRole("list", { name: "Search results" });
    expect(within(results).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Population & Housing", "ACS Housing Stress",
    ]);
    await user.keyboard("{Enter}");
    expect(within(results).getByRole("link", { name: "Population & Housing" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");
    expect(screen.queryByRole("list", { name: "Search results" })).not.toBeInTheDocument();
  });

  it("handles empty results and dismisses them when navigation receives focus", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "zzzzzz");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No matches"));
    await user.click(screen.getByRole("button", { name: "Topic" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
    await user.type(input, "housing");
    await user.click(document.body);
    expect(screen.queryByRole("list", { name: "Search results" })).not.toBeInTheDocument();
    expect(input).toBeInTheDocument();
  });

  it("includes document matches with links to their readers", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ results: [
      { href: "/documents/population-guide", label: "Population guide", kind: "Document", summary: "Migration methodology." },
    ] }) });
    const user = userEvent.setup();
    render(<Navbar />);
    await user.type(screen.getByRole("searchbox"), "migration");
    const link = await screen.findByRole("link", { name: /Population guide/ });
    expect(link).toHaveAttribute("href", "/documents/population-guide");
    expect(fetch).toHaveBeenCalledWith("/api/search/documents?q=migration", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("reports document search failures and retries without losing local matches", async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    const user = userEvent.setup();
    render(<Navbar />);
    await user.type(screen.getByRole("searchbox"), "housing");
    expect(await screen.findByRole("alert")).toHaveTextContent("Document search is unavailable");
    expect(within(screen.getByRole("list", { name: "Search results" })).getByRole("link", { name: "Population & Housing" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 matching results"));
  });

  it("ignores a delayed response for a previous query", async () => {
    let resolveOld;
    fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    render(<Navbar />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "old" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "new" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    resolveOld({ ok: true, json: async () => ({ results: [{ href: "/documents/old", label: "Old result" }] }) });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No matches"));
    expect(screen.queryByRole("link", { name: "Old result" })).not.toBeInTheDocument();
  });
});
