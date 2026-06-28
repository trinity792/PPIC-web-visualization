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

/**
 * Shared chrome for a category dashboard: the titled, bordered container every
 * category renders its tiles inside. Per-category dashboards supply the content.
 */
export default function DashboardShell({ category, children }) {
  return (
    <Card className="overflow-hidden bg-background shadow-sm">
      <CardHeader className="border-b px-6 py-7 text-center sm:px-10">
        <CardTitle className="font-serif text-3xl leading-tight sm:text-5xl">
          <Link
            href={category.modulePath}
            className="hover:text-[var(--ppic-brand)]"
          >
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
