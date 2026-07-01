"use client";

/**
 * ReportProblemDialog.js — persistent report trigger and public-report disclosure dialog.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Static link to the PPIC bug report Google Form
 *
 * UI Kit reference:
 *   - Composes the shared small Button and Dialog patterns
 */

import React, { useState } from "react";
import { Bug } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const BUG_REPORT_FORM_URL = "https://forms.gle/Tp8Ah1hyswFLtKgh9";
const CONTACT_EMAIL = "jones@ppic.org";

export default function ReportProblemDialog() {
  const [isCopied, setIsCopied] = useState(false);

  async function handleCopyEmail() {
    await navigator.clipboard.writeText(CONTACT_EMAIL);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 2000);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed right-4 bottom-4 z-40 rounded-full border-ppic-neutral-300 bg-white text-ppic-neutral-600 shadow-md hover:bg-ppic-neutral-50 hover:text-ppic-neutral-600 sm:right-6 sm:bottom-6"
        >
          <Bug aria-hidden="true" />
          Report a problem
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>
            Click Continue to open the bug report form in a new tab.
          </DialogDescription>
        </DialogHeader>

        <div className="text-sm leading-6 text-ppic-neutral-500">
          <p>
            If you have any questions, email Trinity at{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-2 hover:text-ppic-neutral-400"
              onClick={handleCopyEmail}
              aria-label={`Copy ${CONTACT_EMAIL} to clipboard`}
            >
              {CONTACT_EMAIL}
              {isCopied ? " (Copied)" : ""}
            </button>
            .
          </p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button asChild>
            <a
              href={BUG_REPORT_FORM_URL}
              target="_blank"
              rel="noreferrer"
            >
              Continue
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
