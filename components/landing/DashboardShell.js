/**
 * DashboardShell.js — shared titled container for a landing-page category dashboard.
 *
 * Props:
 *   category {Object}    — category metadata from the category registry
 *   children {ReactNode} — dashboard tiles and summary content
 *
 * Data sources:
 *   - Category metadata via props from app/page.js
 *
 * UI Kit reference:
 *   - Implements the "Dashboard Container" card pattern
 */

/* eslint-disable react/prop-types */

import React from "react";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardShell({ category, children }) {
  return (
    <Card className="overflow-hidden bg-background shadow-sm">
      <CardHeader className="border-b px-6 py-7 text-center sm:px-10">
        <CardTitle className="font-serif text-3xl leading-tight sm:text-5xl">
          <Link href={category.modulePath} className="hover:text-ppic-brand">
            {category.title}
          </Link>
        </CardTitle>
        <CardDescription className="mx-auto max-w-3xl text-base">
          {category.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5 sm:p-8">{children}</CardContent>
    </Card>
  );
}
