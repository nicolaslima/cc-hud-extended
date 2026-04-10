/**
 * Line registry and custom line loader.
 * Discovers built-in and user-defined line renderers.
 */

import fs from "node:fs";
import path from "node:path";
import type { LineRenderer, HudConfig } from "../core/types.js";
import { gsdLine } from "./gsd.js";
import { systemLine } from "./system.js";
import { memLine } from "./mem.js";

/** Built-in line renderers */
const BUILT_IN_LINES: LineRenderer[] = [gsdLine, memLine, systemLine];

/** Load custom line renderers from a directory */
function loadCustomLines(dir: string): LineRenderer[] {
  if (!fs.existsSync(dir)) return [];

  const lines: LineRenderer[] = [];
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    for (const file of files) {
      try {
        const mod = require(path.join(dir, file));
        if (mod.default?.id && typeof mod.default.render === "function") {
          lines.push(mod.default);
        } else if (mod?.id && typeof mod.render === "function") {
          lines.push(mod);
        }
      } catch {
        // Skip broken custom lines silently
      }
    }
  } catch { /* no custom lines */ }

  return lines;
}

/** Get all line renderers (built-in + custom) in configured order */
export function getAllLines(config: HudConfig): LineRenderer[] {
  const customDir = config.customLinesDir;
  const customLines = customDir ? loadCustomLines(customDir) : [];

  const allLines = [...BUILT_IN_LINES, ...customLines];
  const order = config.lineOrder;

  if (!order) return allLines;

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