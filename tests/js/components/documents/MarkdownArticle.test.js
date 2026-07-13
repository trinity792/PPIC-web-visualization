import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

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
