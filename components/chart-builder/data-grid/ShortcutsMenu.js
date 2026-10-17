"use client";
/**
 * ShortcutsMenu.js — scheme choice and help generated from the actual keymap.
 * Props: open/mac {boolean}; onOpenChange/setScheme {Function}; scheme {string}.
 * Data sources: gridKeymap and useShortcutScheme.
 * UI Kit reference: ui/dialog, ui/select, table typography.
 */
import React, { useId } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { shortcutHelp } from "@/lib/tabular/gridKeymap";
export default function ShortcutsMenu({ open, onOpenChange, scheme, setScheme, mac }) {
  const typeId = useId();
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col sm:max-w-3xl">
    <DialogHeader className="shrink-0">
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogDescription>Match the shortcuts to your preferred spreadsheet. Your choice is remembered in this browser.</DialogDescription>
    </DialogHeader>
    <div className="grid shrink-0 gap-2 sm:max-w-xs">
      <Label htmlFor={typeId}>Spreadsheet Type</Label>
      <Select value={scheme} onValueChange={setScheme}><SelectTrigger id={typeId}><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="sheets">Google Sheets</SelectItem><SelectItem value="excel">Excel</SelectItem>
      </SelectContent></Select>
    </div>
    <div className="max-h-[60svh] min-h-0 flex-1 overflow-auto rounded-md border"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-muted"><tr><th scope="col" className="p-3">Action</th><th scope="col" className="p-3">Keys</th></tr></thead><tbody>
      {shortcutHelp(scheme, mac).map((entry, i) => <tr key={`${entry.action}-${i}`} className="border-t"><td className="p-3">{entry.label}{entry.when === "editing" && <span className="block text-xs text-muted-foreground">While editing</span>}</td><td className="whitespace-nowrap p-3 font-mono text-xs">{entry.keys}</td></tr>)}
    </tbody></table></div>
  </DialogContent></Dialog>;
}
