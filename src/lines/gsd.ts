/**
 * GSD (Get Shit Done) line renderer.
 * Shows GSD project status, current task, context usage, and update availability.
 * Works with or without STATE.md (uses official GSD approach for task/context data).
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { StatuslinePayload, HudConfig, LineRenderer, LineConfig, LineColors } from "../core/types.js";
import { colorize, secondary, joinSegments } from "../utils/ansi.js";
import { getLineConfig } from "../core/config.js";

interface GsdLineConfig extends LineConfig {
  showPhase: boolean;
  showPlan: boolean;
  showPercent: boolean;
  showStatus: boolean;
  showTask: boolean;
  showContext: boolean;
  showUpdates: boolean;
}

const DEFAULTS: GsdLineConfig = {
  enabled: true,
  label: "gsd",
  colors: {
    label: "#416a63",
    executing: "#517243",
    warning: "#c0d18c",
    critical: "#af7c84",
  },
  showPhase: true,
  showPlan: true,
  showPercent: true,
  showStatus: true,
  showTask: true,
  showContext: true,
  showUpdates: true,
};

// --- Official GSD approach: read from payload + todos ---

function getCurrentTask(payload: StatuslinePayload): string | null {
  const session = payload.session_id || "";
  if (!session) return null;

  const homeDir = os.homedir();
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(homeDir, ".claude");
  const todosDir = path.join(claudeDir, "todos");

  try {
    if (!fs.existsSync(todosDir)) return null;
    const files = fs.readdirSync(todosDir)
      .filter(f => f.startsWith(session) && f.includes("-agent-") && f.endsWith(".json"))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > 0) {
      const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), "utf8"));
      const inProgress = todos.find((t: { status: string }) => t.status === "in_progress");
      if (inProgress) return inProgress.activeForm || inProgress.subject || null;
    }
  } catch { /* silent */ }
  return null;
}

function getContextUsage(payload: StatuslinePayload): { bar: string; used: number; ansi: string } | null {
  const remaining = payload.context_window?.remaining_percentage;
  if (remaining == null) return null;

  const BUFFER_PCT = 16.5;
  const usableRemaining = Math.max(0, ((remaining - BUFFER_PCT) / (100 - BUFFER_PCT)) * 100);
  const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));
  const filled = Math.floor(used / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);

  if (used < 50) return { bar, used, ansi: "\x1b[32m" };
  if (used < 65) return { bar, used, ansi: "\x1b[33m" };
  if (used < 80) return { bar, used, ansi: "\x1b[38;5;208m" };
  return { bar, used, ansi: "\x1b[5;31m" };
}

function getGsdUpdates(): { updateAvailable: boolean; staleHooks: boolean } {
  const homeDir = os.homedir();
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(homeDir, ".claude");
  const shared = path.join(homeDir, ".cache", "gsd", "gsd-update-check.json");
  const legacy = path.join(claudeDir, "cache", "gsd-update-check.json");
  const cacheFile = fs.existsSync(shared) ? shared : legacy;

  try {
    if (!fs.existsSync(cacheFile)) return { updateAvailable: false, staleHooks: false };
    const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    return {
      updateAvailable: !!cache.update_available,
      staleHooks: !!(cache.stale_hooks?.length > 0),
    };
  } catch { /* silent */ }
  return { updateAvailable: false, staleHooks: false };
}

// --- STATE.md approach (used when available) ---

function findProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".planning"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function parseState(statePath: string) {
  try {
    const content = fs.readFileSync(statePath, "utf8");
    const phaseMatch = content.match(/\*\*Phase:\*\*\s*(.+)/) ||
      content.match(/^Phase:\s*(.+)$/m);
    const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/) ||
      content.match(/^Status:\s*(.+)$/m);
    const planMatch = content.match(/(\d+)\s*\([^)]*(\d+)\s+total/i) ||
      content.match(/(\d+)\s+of\s+(\d+)/i);
    const percentMatch = content.match(/percent:\s*(\d+)/i) ||
      content.match(/`?\[[^\]]*\]\s*(\d+)%/);

    const phase = phaseMatch ? phaseMatch[1].trim() : "unknown";
    const status = statusMatch ? statusMatch[1].trim().toLowerCase() : "unknown";
    const plan = planMatch ? { current: Number(planMatch[1]), total: Number(planMatch[2]) } : null;
    const percent = percentMatch ? Number(percentMatch[1]) : 0;

    return { phase, status, plan, percent };
  } catch {
    return null;
  }
}

function resolveStatusColor(status: string, colors: LineColors): string {
  if (status.includes("blocked")) return colors.critical || "#af7c84";
  if (status.includes("execut")) return colors.executing || "#517243";
  if (status.includes("planning") || status.includes("ready")) return colors.warning || "#c0d18c";
  return colors.label || "#416a63";
}

function getProjectName(projectRoot: string): string {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(projectRoot, ".planning", "config.json"), "utf8"));
    return config.project_code || path.basename(projectRoot);
  } catch {
    return path.basename(projectRoot);
  }
}

// --- Main renderer ---

export const gsdLine: LineRenderer = {
  id: "gsd",

  async render(payload: StatuslinePayload, config: HudConfig): Promise<string | null> {
    const lineConfig = getLineConfig(config, "gsd", DEFAULTS) as GsdLineConfig;
    if (lineConfig.enabled === false) return null;

    const colors = lineConfig.colors || {};
    const segments: (string | null)[] = [
      colorize(String(lineConfig.label || "gsd"), colors.label || "#416a63"),
    ];

    // 1. Check for GSD project with STATE.md
    const currentDir = payload.workspace?.current_dir || payload.cwd || process.cwd();
    const projectRoot = findProjectRoot(currentDir);
    const statePath = projectRoot ? path.join(projectRoot, ".planning", "STATE.md") : null;
    const hasState = statePath && fs.existsSync(statePath);

    if (hasState) {
      const state = parseState(statePath!);
      if (state) {
        if (lineConfig.showPhase) segments.push(secondary(state.phase, config));
        if (lineConfig.showPlan && state.plan) {
          segments.push(secondary(`plan ${state.plan.current}/${state.plan.total}`, config));
        }
        if (lineConfig.showPercent) segments.push(secondary(`${state.percent}%`, config));
        if (lineConfig.showStatus) {
          segments.push(colorize(state.status, resolveStatusColor(state.status, colors as LineColors)));
        }
      }
    } else if (projectRoot) {
      segments.push(secondary(getProjectName(projectRoot), config));
      try {
        const pConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, ".planning", "config.json"), "utf8"));
        if (pConfig.mode) segments.push(secondary(pConfig.mode, config));
      } catch { /* no config */ }
    }

    // 2. Current task from Claude Code's todos
    const task = getCurrentTask(payload);
    if (task && lineConfig.showTask) {
      segments.push(colorize(task, colors.executing || "#517243"));
    }

    // 3. Context usage progress bar
    if (lineConfig.showContext) {
      const ctx = getContextUsage(payload);
      if (ctx) {
        segments.push(`${ctx.ansi}${ctx.bar} ${ctx.used}%\x1b[0m`);
      }
    }

    // 4. GSD update warnings
    if (lineConfig.showUpdates) {
      const updates = getGsdUpdates();
      if (updates.updateAvailable) segments.push(colorize("⬆ update", colors.warning || "#c0d18c"));
      if (updates.staleHooks) segments.push(colorize("⚠ stale", colors.critical || "#af7c84"));
    }

    return joinSegments(config, segments);
  },
};