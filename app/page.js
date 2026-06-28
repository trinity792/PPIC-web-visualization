import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CATEGORIES } from "@/lib/visualization/categoryRegistry";
import { getDashboard } from "@/components/landing/dashboards";

export default function Home() {
  const liveCategories = CATEGORIES.filter((category) => category.status === "live");
  const futureCategories = CATEGORIES.filter(
    (category) => category.status === "coming-soon",
  );

  return (
    <main className="min-h-[calc(100svh-7.5rem)] bg-muted/45 px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-375 space-y-8">
        {/* One self-contained dashboard per live category. */}
        {liveCategories.map((category) => {
          const Dashboard = getDashboard(category.id);
          if (!Dashboard) return null;
          return <Dashboard key={category.id} category={category} />;
        })}

        <section>
          <div className="mb-4">
            <h2 className="font-heading text-2xl font-semibold">More data modules</h2>
            <p className="text-muted-foreground">
              Additional PPIC research areas can be added through the category registry.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {futureCategories.map((category) => (
              <Card key={category.id} className="bg-background/80">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-lg">{category.title}</CardTitle>
                    <Badge variant="secondary">Coming soon</Badge>
                  </div>
                  <CardDescription>{category.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
