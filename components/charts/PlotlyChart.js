"use client";

/* eslint-disable react/prop-types */
import React from "react";
import dynamic from "next/dynamic";
import { useIsMobile } from "@/components/ui/use-mobile";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export default function PlotlyChart({
  data = [],
  layout = {},
  config = {},
  height = 520,
  className,
}) {
  const isMobile = useIsMobile();
  return (
    <div className={className}>
      <Plot
        data={data}
        layout={layout}
        config={{
          ...config,
          displayModeBar: isMobile ? false : config.displayModeBar,
        }}
        useResizeHandler
        style={{ width: "100%", height: `${height}px` }}
      />
    </div>
  );
}
