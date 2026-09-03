import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MarkdownArticle from "@/components/documents/MarkdownArticle";

describe("MarkdownArticle", () => {
  it("renders a metadata footnote after the Markdown body", () => {
    render(
      <MarkdownArticle
        content={"# Document Title\n\nBody text."}
        footnote="Written by Trinity Jones and used GPT 5.5 for grammatical fixes"
        linkMap={{}}
        assetMap={{}}
      />
    );

    const body = screen.getByText("Body text.");
    const footnote = screen.getByText(
      "Written by Trinity Jones and used GPT 5.5 for grammatical fixes"
    );
    const footer = footnote.closest("footer");

    expect(footer).toHaveClass("ppic-document-footnote");
    expect(footer.querySelector("hr")).toBeInTheDocument();
    expect(body.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("omits the metadata footnote when no Footnote field is present", () => {
    const { container } = render(
      <MarkdownArticle content={"# Document Title\n\nBody text."} linkMap={{}} assetMap={{}} />
    );

    expect(container.querySelector(".ppic-document-footnote")).not.toBeInTheDocument();
  });
});

/**
 * Workstream G - the Settings Reference's additional-information toggle.
 *
 * The generated reference is long by design: every setting the editor can show,
 * with its section, applicability, valid values, and configuration key. A
 * reader who is checking one fact does not want the purpose paragraphs, the
 * implications, and the examples in the way, and hiding them one at a time is
 * not a real option across a hundred rows.
 *
 * The rule the toggle must respect: it hides explanation, never contract. Name,
 * section, applicability, valid values or limits, and configuration key stay
 * visible in both states, because those are the facts a reader came for.
 */
const markdownArticleModule = () => import("@/components/documents/MarkdownArticle");

const REFERENCE = `## Settings Reference

<!-- settings-reference:start -->

| Setting | Section | Applies to | Values | Config key |
|---|---|---|---|---|
| Calculation | Outcome | All charts | actual, numericChange, percentChange, indexed | question.calculation.id |

<!-- settings-reference:end -->

:::additional-information
Choosing what to measure and what to do to it is one decision. Splitting the two
across sections is how a reader ends up indexing a rate.
:::
`;

describe("Settings Reference additional information", () => {
  it("shows additional information by default", async () => {
    const { default: Article } = await markdownArticleModule();
    render(<Article content={REFERENCE} linkMap={{}} assetMap={{}} />);

    // The full reference is the default, because a first-time reader needs the
    // explanations more than a returning one needs them gone.
    expect(screen.getByText(/Splitting the two/)).toBeVisible();
    expect(
      screen.getByRole("switch", { name: /show additional information/i }),
    ).toBeChecked();
  });

  it("hides all additional information with one toggle", async () => {
    const { default: Article } = await markdownArticleModule();
    const user = userEvent.setup();
    render(<Article content={REFERENCE} linkMap={{}} assetMap={{}} />);

    await user.click(screen.getByRole("switch", { name: /show additional information/i }));
    expect(screen.queryByText(/Splitting the two/)).not.toBeInTheDocument();
  });

  it("keeps names applicability limits and config keys visible", async () => {
    const { default: Article } = await markdownArticleModule();
    const user = userEvent.setup();
    render(<Article content={REFERENCE} linkMap={{}} assetMap={{}} />);

    await user.click(screen.getByRole("switch", { name: /show additional information/i }));

    // Hiding the help must not hide the contract.
    expect(screen.getByText("Calculation")).toBeVisible();
    expect(screen.getByText("Outcome")).toBeVisible();
    expect(screen.getByText("All charts")).toBeVisible();
    expect(screen.getByText(/actual, numericChange/)).toBeVisible();
    expect(screen.getByText("question.calculation.id")).toBeVisible();
  });

  it("adds no toggle to a document that has no additional information", async () => {
    const { default: Article } = await markdownArticleModule();
    render(<Article content={"# A guide\n\nOrdinary prose."} linkMap={{}} assetMap={{}} />);

    // The document renderer stays general. One narrowly scoped extension for
    // the reference is the budget; turning every page into an app is not.
    expect(
      screen.queryByRole("switch", { name: /show additional information/i }),
    ).not.toBeInTheDocument();
  });
});
