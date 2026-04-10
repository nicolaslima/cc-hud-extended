/**
 * Line registry and custom line loader.
 * Discovers built-in and user-defined line renderers.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { LineRenderer, HudConfig } from "../core/types.js";
import { gsdLine } from "./gsd.js";
import { gsdDetailLine } from "./gsd-detail.js";
import { systemLine } from "./system.js";
import { memLine } from "./mem.js";

/** Built-in line renderers */
const BUILT_IN_LINES: LineRenderer[] = [gsdLine, gsdDetailLine, memLine, systemLine];

/**
 * Dynamic import for custom line loading.
 * Uses pathToFileURL for reliable cross-platform file:// URIs.
 * Falls back gracefully if the module can't be loaded.
 */
async function loadModule(modulePath: string): Promise<Record<string, unknown> | null> {
  try {
    const fileUrl = pathToFileURL(modulePath).href;
    const mod = await import(fileUrl);
    return mod as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Load custom line renderers from a directory */
async function loadCustomLines(dir: string): Promise<LineRenderer[]> {
  if (!fs.existsSync(dir)) return [];

  const lines: LineRenderer[] = [];
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    for (const file of files) {
      try {
        const mod = await loadModule(path.join(dir, file));
        if (!mod) continue;
        if ((mod as Record<string, unknown>).default &&
            typeof (mod.default as Record<string, unknown>).id === "string" &&
            typeof (mod.default as Record<string, unknown>).render === "function") {
          lines.push(mod.default as unknown as LineRenderer);
        } else if (typeof mod.id === "string" && typeof mod.render === "function") {
          lines.push(mod as unknown as LineRenderer);
        }
      } catch {
        // Skip broken custom lines silently
      }
    }
  } catch { /* no custom lines */ }

  return lines;
}

/** Get all line renderers (built-in + custom) in configured order */
export async function getAllLines(config: HudConfig): Promise<LineRenderer[]> {
  const customDir = config.customLinesDir;
  const customLines = customDir ? await loadCustomLines(customDir) : [];

  const allLines = [...BUILT_IN_LINES, ...customLines];
  const order = config.lineOrder;

  if (!order || !Array.isArray(order)) return allLines;

  // Sort by lineOrder, unknown lines go last
  const ordered: LineRenderer[] = [];
  const seen = new Set<string>();

  for (const id of order) {
    const line = allLines.find(l => l.id === id);
    if (line && !seen.has(id)) {
      ordered.push(line);
      seen.add(id);
    }
  }

  // Add remaining lines not in the order list
  for (const line of allLines) {
    if (!seen.has(line.id)) {
      ordered.push(line);
      seen.add(line.id);
    }
  }

  return ordered;
}