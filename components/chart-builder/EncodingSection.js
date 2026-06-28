"use client";

import React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATALOG_ROLE_FOR_BINDING,
  getChartType,
} from "@/lib/visualization/chartRegistry";
import { isMeasure, supportsRole } from "@/lib/visualization/fieldTypes";
import { getPreset } from "@/lib/visualization/presetRegistry";
import { useChartConfig } from "./chartConfigStore";
import LayerEditor from "./LayerEditor";

const NONE = "__none__";

function roleLabel(role) {
  const labels = {
    x: "X axis",
    y: "Y axis",
    series: "Compare by",
    color: "Color",
    benchmark: "Benchmark",
    facet: "Facet",
    category: "Category",
    group: "Group",
    geography: "Geography",
    period: "Period",
    start: "Start value",
    end: "End value",
    unit: "Observation unit",
    size: "Bubble size",
  };
  return labels[role] || role;
}

export default function EncodingSection() {
  const { config, dispatch, schema } = useChartConfig();
  const chart = getChartType(config.chartType);
  const preset = getPreset(config.preset);
  const declared = preset?.sidebar?.encodings;
  const roles = declared?.length
    ? declared
    : [...chart.requiredRoles, ...chart.optionalRoles];

  return (
    <div className="grid gap-4">
      {roles.map((role) => {
        const accepted = chart.roleConstraints[role] || [];
        const catalogRole = CATALOG_ROLE_FOR_BINDING[role];
        const fields = Object.entries(schema.fields).filter(([, field]) => {
          if (!accepted.includes(field.kind)) return false;
          return !isMeasure(field) || !catalogRole || supportsRole(field, catalogRole);
        });
        const required = chart.requiredRoles.includes(role);

        return (
          <div className="grid gap-2" key={role}>
            <Label htmlFor={`binding-${role}`}>
              {roleLabel(role)}
              {required ? <span className="text-destructive">*</span> : null}
            </Label>
            <Select
              value={config.bindings[role] || NONE}
              onValueChange={(field) =>
                dispatch({
                  type: "SET_BINDING",
                  role,
                  field: field === NONE ? null : field,
                })
              }
            >
              <SelectTrigger id={`binding-${role}`}>
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {!required ? <SelectItem value={NONE}>Not set</SelectItem> : null}
                {fields.map(([name, field]) => (
                  <SelectItem key={name} value={name}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}

      {config.chartType === "line" ? (
        <LayerEditor
          trigger={
            <Button type="button" variant="outline" className="w-full">
              <Plus />
              Add line
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
