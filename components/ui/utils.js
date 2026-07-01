/**
 * utils.js — Tailwind-aware class-name composition helper.
 *
 * Props:
 *   inputs {...any} — conditional class-name values accepted by clsx
 *
 * Data sources:
 *   - Function arguments
 *
 * UI Kit reference:
 *   - None — styling utility that does not render UI
 */

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
