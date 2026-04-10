/**
 * Shared utilities for GSD line renderers.
 * Used by both gsd.ts (primary) and gsd-detail.ts (secondary).
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { StatuslinePayload } from "../core/types.js";

// --- Project detection ---

export function findProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".planning"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Resolve GSD project root from payload directories.
 * Checks project_dir first (main project), then current_dir, then cwd.
 */
export function resolveProjectRoot(payload: StatuslinePayload): string | null {
  const dirsToCheck = [
    payload.workspace?.project_dir,
    payload.workspace?.current_dir,
    payload.cwd,
  ].filter(Boolean) as string[];

  return dirsToCheck.reduce<string | null>((found, dir) => found || findProjectRoot(dir), null);
}

// --- STATE.md parsing ---

export interface ParsedState {
  phase: string;
  status: string;
  plan: { current: number; total: number } | null;
  percent: number;
  lastActivity: { date: Date; text: string } | null;
  blockers: string[];
  pendingTodosCount: number;
}

export function parseState(statePath: string): ParsedState | null {
  try {
    const content = fs.readFileSync(statePath, "utf8");

    const phaseMatch = content.match(/\*\*Phase:\*\*\s*(.+)/) ||
      content.match(/^Phase:\s*(.+)$/m);
    const phase = phaseMatch ? phaseMatch[1].trim() : "unknown";

    const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/) ||
      content.match(/^Status:\s*(.+)$/m);
    const status = statusMatch ? statusMatch[1].trim().toLowerCase() : "unknown";

    // Plan progress — look for "Plan:" line specifically first
    const planLineMatch = content.match(/^Plan:\s*(\d+)\s*(?:of|\/)\s*(\d+)/im) ||
      content.match(/\*\*Plan:\*\*\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
    const planMatch = planLineMatch || content.match(/(\d+)\s*\([^)]*(\d+)\s+total/i) ||
      content.match(/(\d+)\s+of\s+(\d+)/i);
    const plan = planMatch ? { current: Number(planMatch[1]), total: Number(planMatch[2]) } : null;

    const percentMatch = content.match(/percent:\s*(\d+)/i) ||
      content.match(/`?\[[^\]]*\]\s*(\d+)%/) ||
      content.match(/Progress:.*?(\d+)%/);
    const percent = percentMatch ? Number(percentMatch[1]) : 0;

    const lastActivityMatch = content.match(/Last activity:\s*(\d{4}-\d{2}-\d{2})\s*[—\-]\s*(.+)/i);
    let lastActivity: ParsedState["lastActivity"] = null;
    if (lastActivityMatch) {
      const date = new Date(lastActivityMatch[1]);
      lastActivity = { date, text: lastActivityMatch[2].trim() };
    }

    const blockers: string[] = [];
    const blockersMatch = content.match(/###?\s*Blockers?\/?(?:Concerns?)?\s*\n([\s\S]*?)(?=\n##|\n###?\s|$)/i);
    if (blockersMatch) {
      const lines = blockersMatch[1].split("\n")
        .map(l => l.replace(/^[-*]\s*/, "").trim())
        .filter(l => l.length > 0 && l.toLowerCase() !== "none yet." && !l.startsWith("[From"));
      blockers.push(...lines);
    }

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

// --- Project config ---

export function getProjectName(projectRoot: string): string {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(projectRoot, ".planning", "config.json"), "utf8"));
    return config.project_code || path.basename(projectRoot);
  } catch {
    return path.basename(projectRoot);
  }
}

export function getProjectConfig(projectRoot: string): { mode?: string; modelProfile?: string } {
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

// --- Task from Claude Code todos ---

export function getCurrentTask(payload: StatuslinePayload): string | null {
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

// --- Context usage ---

export function getContextUsage(payload: StatuslinePayload): { bar: string; used: number; ansi: string } | null {
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

// --- GSD updates ---

export function getGsdUpdates(): { updateAvailable: boolean; staleHooks: boolean } {
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

// --- Phase progress from ROADMAP.md ---

export interface PhaseProgress {
  current: number;
  total: number;
  bar: string;
}

export function getPhaseProgress(projectRoot: string): PhaseProgress | null {
  const roadmapPath = path.join(projectRoot, ".planning", "ROADMAP.md");
  try {
    if (!fs.existsSync(roadmapPath)) return null;
    const content = fs.readFileSync(roadmapPath, "utf8");

    const phaseLines = content.match(/^##\s+Phase\s+\d+/gm) ||
      content.match(/^###\s+Phase\s+\d+/gm) ||
      content.match(/^#{1,3}\s+\d+\.\s+/gm);

    if (!phaseLines || phaseLines.length === 0) return null;

    const total = phaseLines.length;
    const completedMatches = content.match(/[~✓✔✅]|completed?\s*:/gi);
    const completed = completedMatches ? completedMatches.length : 0;

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

// --- Pending todos from filesystem ---

export function getPendingTodosCount(projectRoot: string): number {
  const pendingDir = path.join(projectRoot, ".planning", "todos", "pending");
  try {
    if (!fs.existsSync(pendingDir)) return 0;
    return fs.readdirSync(pendingDir).filter(f => f.endsWith(".json") || f.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

// --- Relative time formatting ---

export function formatRelativeTime(date: Date): string {
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

// --- Status color resolution ---

export function resolveStatusColor(status: string, colors: { critical?: string; executing?: string; warning?: string; label?: string }): string {
  if (status.includes("blocked")) return colors.critical || "#af7c84";
  if (status.includes("execut")) return colors.executing || "#517243";
  if (status.includes("planning") || status.includes("ready")) return colors.warning || "#c0d18c";
  return colors.label || "#416a63";
}