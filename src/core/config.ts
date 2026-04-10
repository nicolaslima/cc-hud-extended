/**
 * Configuration loader with layered defaults.
 * Priority: defaults → config file → env overrides
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { HudConfig, LineConfig } from "./types.js";

const CONFIG_DIR = process.env.CC_HUD_CONFIG_DIR ||
  path.join(os.homedir(), ".config", "cc-hud-extended");

const CONFIG_FILENAME = "config.json";

const DEFAULT_CONFIG: HudConfig = {
  separator: " • ",
  colors: { secondary: "dim" },
  baseHud: {
    enabled: true,
    filterPhaseLine: true,
    filterMemoryLine: true,
    separatorReplace: " • ",
  },
  lines: {},
  lineOrder: ["gsd", "mem", "system"],
  customLinesDir: path.join(CONFIG_DIR, "lines"),
};

function safeJsonParse(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Read and merge config from disk */
export function loadConfig(configPath?: string): HudConfig {
  const filePath = configPath ||
    process.env.CC_HUD_CONFIG ||
    path.join(CONFIG_DIR, CONFIG_FILENAME);

  let fileConfig: Partial<HudConfig> = {};
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    fileConfig = safeJsonParse(raw, {}) as Partial<HudConfig>;
  } catch {
    // No config file — use defaults
  }

  return deepMerge(DEFAULT_CONFIG, fileConfig) as HudConfig;
}

/** Get the effective config for a specific line */
export function getLineConfig<T extends LineConfig>(
  config: HudConfig,
  lineId: string,
  lineDefaults: T
): T {
  const userConfig = config.lines?.[lineId] || {};
  return { ...lineDefaults, ...userConfig } as T;
}

/** Get config directory path */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/** Deep merge two objects (target wins over source) */
function deepMerge(source: unknown, target: unknown): unknown {
  if (typeof source !== "object" || source === null) return target;
  if (typeof target !== "object" || target === null) return source;

  const result = { ...(source as Record<string, unknown>) };
  for (const key of Object.keys(target as Record<string, unknown>)) {
    const srcVal = result[key];
    const tgtVal = (target as Record<string, unknown>)[key];
    if (
      typeof srcVal === "object" && srcVal !== null &&
      typeof tgtVal === "object" && tgtVal !== null
    ) {
      result[key] = deepMerge(srcVal, tgtVal);
    } else {
      result[key] = tgtVal;
    }
  }
  return result;
}