/**
 * contrast.js — WCAG contrast between two colors, for choosing readable text.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   READABLE_TEXT_CONTRAST — 4.5, the WCAG AA ratio for normal-size text
 *   contrastRatio(a, b)    — ratio between two "#RRGGBB" (or "#RGB") colors, 1–21
 *   readableTextColor(color, background?) — the color itself when it already
 *     reads as text on the background, otherwise the same hue darkened just
 *     enough to reach 4.5:1 (as PPIC's published Datawrapper charts do)
 *
 * Data sources:
 *   - Color values from lib/constants.js and the palettes
 */

import { COLORS } from "@/lib/constants";

export const READABLE_TEXT_CONTRAST = 4.5;

function channels(hex) {
  const raw = String(hex || "").replace("#", "");
  const full = raw.length === 3 ? [...raw].map((digit) => digit + digit).join("") : raw;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(value)) return [0, 0, 0];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex) {
  const [r, g, b] = channels(hex).map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// ── Darkening in Lab ─────────────────────────────────────────────────
// Lab lightness changes brightness while keeping hue, so a pale lime becomes a
// darker olive rather than a muddy gray. D65 white point, sRGB primaries.

const WHITE_POINT = [0.95047, 1, 1.08883];

function toLinear(channel) {
  const unit = channel / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value) {
  const unit = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, unit)) * 255);
}

function labPivot(t) {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
}

function toLab(hex) {
  const [r, g, b] = channels(hex).map(toLinear);
  const xyz = [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ].map((value, index) => labPivot(value / WHITE_POINT[index]));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}

function fromLab([l, a, b]) {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inverse = (f) => (f ** 3 > 216 / 24389 ? f ** 3 : (116 * f - 16) / (24389 / 27));
  const [x, y, z] = [inverse(fx), inverse(fy), inverse(fz)].map((value, index) => value * WHITE_POINT[index]);
  const rgb = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ].map(fromLinear);
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function readableTextColor(color, background = COLORS.white) {
  if (contrastRatio(color, background) >= READABLE_TEXT_CONTRAST) return color;
  const [lightness, a, b] = toLab(color);
  for (let next = lightness - 1; next >= 0; next -= 1) {
    const candidate = fromLab([next, a, b]);
    if (contrastRatio(candidate, background) >= READABLE_TEXT_CONTRAST) return candidate;
  }
  return COLORS.officialDarkGray;
}
