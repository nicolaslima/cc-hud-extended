/**
 * claude-hud bridge.
 * Optionally calls the installed claude-hud as a subprocess and filters its output.
 * If claude-hud is not installed, returns empty string (standalone mode).
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import type { HudConfig } from "./types.js";
import { stripAnsi } from "../utils/ansi.js";

function getClaudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

/** Find the latest installed version of claude-hud */
export function findClaudeHudEntry(): string | null {
  const baseDir = path.join(getClaudeConfigDir(), "plugins", "cache", "claude-hud", "claude-hud");
  try {
    const versions = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const latest = versions.at(-1);
    return latest ? path.join(baseDir, latest, "dist", "index.js") : null;
  } catch {
    return null;
  }
}

/** Check if claude-hud is available */
export function isClaudeHudAvailable(): boolean {
  return findClaudeHudEntry() !== null;
}

/** Call claude-hud and return its raw output */
export function renderBaseHud(rawInput: string): string {
  const entry = findClaudeHudEntry();
  if (!entry || !fs.existsSync(entry)) return "";

  const result = spawnSync(process.execPath, [entry], {
    input: rawInput,
    encoding: "utf8",
    env: process.env,
    timeout: 2000,
  });

  if (result.status !== 0 || !result.stdout) return "";
  return result.stdout.trimEnd();
}

/** Filter and normalize claude-hud output lines */
export function filterBaseHud(baseHud: string, config: HudConfig): string {
  const baseConfig = config.baseHud || {};
  const lines = baseHud.split("\n").filter(line => {
    const plain = stripAnsi(line).trim();
    if (!plain) return false;

    // Filter Phase lines if configured
    if (baseConfig.filterPhaseLine !== false && /^[▶◉○⚠]\s+Phase\s+\d+/u.test(plain)) return false;
    // Filter Memory lines if configured
    if (baseConfig.filterMemoryLine !== false && /^🧠\s+/u.test(plain)) return false;

    return true;
  });

  // Replace separators if configured
  const separator = baseConfig.separatorReplace;
  if (separator) {
    return lines.map(line => line.replaceAll(" │ ", separator).replaceAll(" | ", separator)).join("\n");
  }

  return lines.join("\n");
}