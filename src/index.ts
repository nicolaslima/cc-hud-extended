#!/usr/bin/env node
/**
 * cc-hud-extended — Modular statusline extension for Claude Code.
 *
 * Usage:
 *   As Claude Code statusline command:
 *     node /path/to/cc-hud-extended/dist/index.js
 *
 *   Standalone test:
 *     echo '{"model":{"display_name":"test"}}' | node dist/index.js
 *
 * Custom lines:
 *   Drop .js files in ~/.config/cc-hud-extended/lines/
 *   Each file should export a LineRenderer object with { id, render(payload, config) }
 */

import { readStdin } from "./core/stdin.js";
import { loadConfig } from "./core/config.js";
import { getAllLines } from "./lines/index.js";
import { renderBaseHud, filterBaseHud, isClaudeHudAvailable } from "./core/base-hud.js";
import type { StatuslinePayload, HudConfig } from "./core/types.js";

/** Maximum time for the entire render cycle (ms) */
const RENDER_TIMEOUT_MS = 800;

function safeJsonParse(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function main(): Promise<void> {
  const rawInput = await readStdin();
  if (!rawInput) {
    // Running without stdin (e.g., setup verification)
    process.stdout.write("cc-hud-extended ready\n");
    return;
  }

  const payload = safeJsonParse(rawInput, {}) as StatuslinePayload;
  const config = loadConfig();

  // Wrap entire render in a timeout guard
  const output = await Promise.race([
    renderOutput(payload, config, rawInput),
    timeout(),
  ]);

  process.stdout.write(output);
}

async function renderOutput(payload: StatuslinePayload, config: HudConfig, rawInput: string): Promise<string> {
  const outputLines: string[] = [];

  // 1. Render base claude-hud if available and enabled
  if (config.baseHud?.enabled !== false && isClaudeHudAvailable()) {
    const baseOutput = renderBaseHud(rawInput);
    if (baseOutput) {
      const filtered = filterBaseHud(baseOutput, config);
      if (filtered) outputLines.push(filtered);
    }
  }

  // 2. Render all line modules in order (parallelized)
  const lines = await getAllLines(config);
  const renderedLines = await Promise.all(
    lines.map(line => line.render(payload, config).catch(() => null))
  );

  for (const line of renderedLines) {
    if (line) outputLines.push(line);
  }

  return outputLines.join("\n");
}

function timeout(): Promise<string> {
  return new Promise(resolve => {
    setTimeout(() => resolve(""), RENDER_TIMEOUT_MS);
  });
}

main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`[cc-hud-extended] ${msg}\n`);
  process.exitCode = 1;
});