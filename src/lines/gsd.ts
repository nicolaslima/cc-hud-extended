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
  showMode: boolean;
  showTask: boolean;
  showBlockers: boolean;
  showPendingTodos: boolean;
  showPhaseProgress: boolean;
  showLastActivity: boolean;
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
  showMode: true,
  showTask: true,
  showBlockers: true,
  showPendingTodos: true,
  showPhaseProgress: true,
  showLastActivity: true,
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

// --- Project detection ---

function findProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".planning"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// --- STATE.md parsing (extended) ---

interface ParsedState {
  phase: string;
  status: string;
  plan: { current: number; total: number } | null;
  percent: number;
  lastActivity: { date: Date; text: string } | null;
  blockers: string[];
  pendingTodosCount: number;
}

function parseState(statePath: string): ParsedState | null {
  try {
    const content = fs.readFileSync(statePath, "utf8");

    // Phase
    const phaseMatch = content.match(/\*\*Phase:\*\*\s*(.+)/) ||
      content.match(/^Phase:\s*(.+)$/m);
    const phase = phaseMatch ? phaseMatch[1].trim() : "unknown";

    // Status
    const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/) ||
      content.match(/^Status:\s*(.+)$/m);
    const status = statusMatch ? statusMatch[1].trim().toLowerCase() : "unknown";

    // Plan progress — look for "Plan:" line specifically first
    const planLineMatch = content.match(/^Plan:\s*(\d+)\s*(?:of|\/)\s*(\d+)/im) ||
      content.match(/\*\*Plan:\*\*\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
    const planMatch = planLineMatch || content.match(/(\d+)\s*\([^)]*(\d+)\s+total/i) ||
      content.match(/(\d+)\s+of\s+(\d+)/i);
    const plan = planMatch ? { current: Number(planMatch[1]), total: Number(planMatch[2]) } : null;

    // Percent
    const percentMatch = content.match(/percent:\s*(\d+)/i) ||
      content.match(/`?\[[^\]]*\]\s*(\d+)%/) ||
      content.match(/Progress:.*?(\d+)%/);
    const percent = percentMatch ? Number(percentMatch[1]) : 0;

    // Last activity
    const lastActivityMatch = content.match(/Last activity:\s*(\d{4}-\d{2}-\d{2})\s*[—\-]\s*(.+)/i);
    let lastActivity: ParsedState["lastActivity"] = null;
    if (lastActivityMatch) {
      const date = new Date(lastActivityMatch[1]);
      lastActivity = { date, text: lastActivityMatch[2].trim() };
    }

    // Blockers/Concerns
    const blockers: string[] = [];
    const blockersMatch = content.match(/###?\s*Blockers?\/?(?:Concerns?)?\s*\n([\s\S]*?)(?=\n##|\n###?\s|$)/i);
    if (blockersMatch) {
      const lines = blockersMatch[1].split("\n")
        .map(l => l.replace(/^[-*]\s*/, "").trim())
        .filter(l => l.length > 0 && l.toLowerCase() !== "none yet." && !l.startsWith("[From"));
      blockers.push(...lines);
    }

    // Pending todos count from STATE.md section
    let pendingTodosCount = 0;
    const pendingMatch = content.match(/###?\s*Pending Todos?\s*\n([\s\S]*?)(?=\n##|\n###?\s|$)/i);
    if (pendingMatch) {
      const lines = pendingMatch[1].split("\n")
        .filter(l => l.match(/^[-*]\s*/) && l.trim().length > 2);
      pendingTodosCount = lines.length;
    }

    return { phase, status, plan, percent, lastActivity, blockers, pendingTodosCount };
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

function getProjectConfig(projectRoot: string): { mode?: string; modelProfile?: string } {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, ".planning", "config.json"), "utf8"));
    return {
      mode: raw.mode,
      modelProfile: raw.model_profile,
    };
  } catch {
    return {};
  }
}

// --- New data sources ---

function getPendingTodosCount(projectRoot: string): number {
  const pendingDir = path.join(projectRoot, ".planning", "todos", "pending");
  try {
    if (!fs.existsSync(pendingDir)) return 0;
    return fs.readdirSync(pendingDir).filter(f => f.endsWith(".json") || f.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

interface PhaseProgress {
  current: number;
  total: number;
  bar: string;
}

function getPhaseProgress(projectRoot: string): PhaseProgress | null {
  const roadmapPath = path.join(projectRoot, ".planning", "ROADMAP.md");
  try {
    if (!fs.existsSync(roadmapPath)) return null;
    const content = fs.readFileSync(roadmapPath, "utf8");

    // Count phases: look for "## Phase N" or phase headings
    const phaseLines = content.match(/^##\s+Phase\s+\d+/gm) ||
      content.match(/^###\s+Phase\s+\d+/gm) ||
      content.match(/^#{1,3}\s+\d+\.\s+/gm);

    if (!phaseLines || phaseLines.length === 0) return null;

    const total = phaseLines.length;

    // Count completed phases (checkmark or "complete" status)
    const completedMatches = content.match(/[~✓✔✅]|completed?\s*:/gi);
    const completed = completedMatches ? completedMatches.length : 0;

    // Also try reading STATE.md for current phase number
    const statePath = path.join(projectRoot, ".planning", "STATE.md");
    let current = completed;
    if (fs.existsSync(statePath)) {
      const stateContent = fs.readFileSync(statePath, "utf8");
      const phaseNumMatch = stateContent.match(/Phase:\s*(\d+)/i) ||
        stateContent.match(/\*\*Phase:\*\*\s*(\d+)/i);
      if (phaseNumMatch) {
        current = Math.min(Number(phaseNumMatch[1]), total);
      }
    }

    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const filled = Math.floor(pct / 10);
    const bar = "▓".repeat(filled) + "░".repeat(10 - filled);

    return { current, total, bar };
  } catch {
    return null;
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return `${Math.floor(diffDays / 7)}w`;
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

    // 1. Detect GSD project — only use payload-provided directories
    // (process.cwd() would leak the shell's cwd in manual tests)
    const dirsToCheck = [
      payload.workspace?.project_dir,
      payload.workspace?.current_dir,
      payload.cwd,
    ].filter(Boolean) as string[];
    const projectRoot = dirsToCheck.reduce<string | null>((found, dir) => found || findProjectRoot(dir), null);
    const statePath = projectRoot ? path.join(projectRoot, ".planning", "STATE.md") : null;
    const hasStateFile = statePath && fs.existsSync(statePath);
    const hasGsdProject = !!projectRoot;

    // 2. Parse project config
    const pConfig = hasGsdProject ? getProjectConfig(projectRoot!) : {};

    // 3. STATE.md-based components
    if (hasStateFile) {
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
        if (lineConfig.showLastActivity && state.lastActivity) {
          const relTime = formatRelativeTime(state.lastActivity.date);
          segments.push(secondary(`${relTime}`, config));
        }
        if (lineConfig.showBlockers && state.blockers.length > 0) {
          segments.push(colorize(`${state.blockers.length} blocked`, colors.critical || "#af7c84"));
        }
      }
    } else if (projectRoot && lineConfig.showPhase) {
      // Fallback when no STATE.md: show project name instead of phase
      segments.push(secondary(getProjectName(projectRoot), config));
    }

    // 4. Mode (from config.json) — show when GSD project exists
    if (lineConfig.showMode && hasGsdProject && pConfig.mode) {
      segments.push(secondary(pConfig.mode, config));
    }

    // 5. Phase progress bar (from ROADMAP.md)
    if (lineConfig.showPhaseProgress && hasGsdProject) {
      const progress = getPhaseProgress(projectRoot!);
      if (progress) {
        segments.push(secondary(`${progress.bar} ${progress.current}/${progress.total}`, config));
      }
    }

    // 6. Pending todos count (from filesystem)
    if (lineConfig.showPendingTodos && hasGsdProject) {
      // Combine STATE.md parsed count + filesystem count
      let fsCount = getPendingTodosCount(projectRoot!);
      let stateCount = 0;
      if (hasStateFile) {
        const state = parseState(statePath!);
        if (state) stateCount = state.pendingTodosCount;
      }
      const total = Math.max(fsCount, stateCount);
      if (total > 0) {
        segments.push(secondary(`${total} todo${total > 1 ? "s" : ""}`, config));
      }
    }

    // 7. Current task from Claude Code's todos
    const task = getCurrentTask(payload);

    // 8. GSD update warnings
    const updates = getGsdUpdates();

    // Only show this line if there's meaningful GSD content
    const hasContent = hasGsdProject || (task && lineConfig.showTask) ||
      (updates.updateAvailable && lineConfig.showUpdates) ||
      (updates.staleHooks && lineConfig.showUpdates);

    if (!hasContent) return null;

    if (task && lineConfig.showTask) {
      segments.push(colorize(task, colors.executing || "#517243"));
    }

    // 9. Context usage progress bar (only show if GSD project exists)
    if (lineConfig.showContext && hasGsdProject) {
      const ctx = getContextUsage(payload);
      if (ctx) {
        segments.push(`${ctx.ansi}${ctx.bar} ${ctx.used}%\x1b[0m`);
      }
    }

    // 10. GSD update warnings
    if (lineConfig.showUpdates) {
      if (updates.updateAvailable) segments.push(colorize("⬆ update", colors.warning || "#c0d18c"));
      if (updates.staleHooks) segments.push(colorize("⚠ stale", colors.critical || "#af7c84"));
    }

    return joinSegments(config, segments);
  },
};