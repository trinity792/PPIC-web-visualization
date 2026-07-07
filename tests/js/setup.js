/**
 * Shared Vitest setup: jest-dom matchers, a network safety net, and a
 * deterministic localStorage.
 *
 * - `fetch` is replaced with a stub that throws, mirroring the pytest suite's
 *   autouse fixture that fails any accidental real HTTP request. Tests that
 *   need fetch must stub it explicitly with fixture data.
 * - Vitest 4's jsdom environment exposes a non-functional localStorage stub
 *   (opaque-origin behavior), so a real in-memory Storage implementation is
 *   installed on both `window` and `globalThis` and cleared per test.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// RTL's automatic DOM cleanup only self-registers when Vitest globals are on;
// this config runs with `globals: false`, so register it explicitly or every
// render accumulates across tests in a file.
afterEach(cleanup);

class MemoryStorage {
  #map = new Map();
  get length() {
    return this.#map.size;
  }
  key(index) {
    return [...this.#map.keys()][index] ?? null;
  }
  getItem(key) {
    return this.#map.has(String(key)) ? this.#map.get(String(key)) : null;
  }
  setItem(key, value) {
    this.#map.set(String(key), String(value));
  }
  removeItem(key) {
    this.#map.delete(String(key));
  }
  clear() {
    this.#map.clear();
  }
}

const memoryStorage = new MemoryStorage();
Object.defineProperty(window, "localStorage", { value: memoryStorage, configurable: true });
vi.stubGlobal("localStorage", memoryStorage);

beforeEach(() => {
  memoryStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error(
        "Real network calls are disabled in tests. Stub `fetch` with fixture data.",
      );
    }),
  );
});
