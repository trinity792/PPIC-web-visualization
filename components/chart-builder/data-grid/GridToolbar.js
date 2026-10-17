"use client";
/**
 * GridToolbar.js — structure actions, sort, formula column and table validity.
 * Props: onAction/onMenu {Function}; malformed {number}.
 * Data sources: parent grid. UI Kit reference: ui/button and lucide icons.
 */
import React from "react";
import { Plus, Trash2, ArrowDownAZ, Ellipsis, Check, FunctionSquare, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function GridToolbar({ onAction, onMenu, malformed }) {
  return <div className="flex flex-wrap items-center gap-1 border-b bg-background p-2">
    <Button variant="ghost" size="sm" aria-label="Add row" onClick={() => onAction("rowBelow")}><Plus className="size-3.5" />Row</Button>
    <Button variant="ghost" size="sm" aria-label="Add column" onClick={() => onAction("columnRight")}><Plus className="size-3.5" />Column</Button>
    <Button variant="ghost" size="sm" aria-label="Delete row" onClick={() => onAction("deleteRows")}><Trash2 className="size-3.5" />Delete row</Button>
    <span className="mx-1 h-5 border-l" aria-hidden="true" />
    <Button variant="ghost" size="sm" onClick={(e) => onMenu("sort", e)}><ArrowDownAZ className="size-3.5" />Sort</Button>
    <Button variant="ghost" size="sm" aria-label="Derived column" onClick={() => onAction("formulaColumn")}><FunctionSquare className="size-3.5" />Derived column</Button>
    <div className="ml-auto flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => onAction("validity")} className="text-xs">
        {!malformed && <Check className="size-3.5 text-ppic-complement-green-600" />}
        {malformed ? `${malformed} cells need attention` : "All columns valid"}
      </Button>
      <Button variant="ghost" size="icon" aria-label="Selection menu" onClick={(e) => onMenu("selection", e)}><Menu className="size-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="More" onClick={(e) => onMenu("more", e)}><Ellipsis className="size-4" /></Button>
    </div>
  </div>;
}
