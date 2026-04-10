/**
 * Claude-mem line renderer.
 * Shows memory/observation counts and worker state from claude-mem.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import type { StatuslinePayload, HudConfig, LineRenderer, LineConfig, LineColors } from "../core/types.js";
import { colorize, secondary, joinSegments } from "../utils/ansi.js";
import { getLineConfig } from "../core/config.js";

interface MemLineConfig extends LineConfig {
  showProject: boolean;
  showObservations: boolean;
  showPrompts: boolean;
  showSessions: boolean;
  showLastActivity: boolean;
  showState: boolean;
}

const DEFAULTS: MemLineConfig = {
  enabled: true,
  label: "mem",
  colors: {
    label: "#416a63",
    ok: "#416a63",
    warning: "#c0d18c",
    critical: "#af7c84",
  },
  showProject: true,
  showObservations: true,
  showPrompts: true,
  showSessions: true,
  showLastActivity: true,
  showState: true,
};

const WORKER_BASE_URL = process.env.CC_HUD_MEM_WORKER_URL || "http://127.0.0.1:37777";
const DATA_DIR = process.env.CC_HUD_MEM_DATA_DIR || path.join(os.homedir(), ".claude-mem");

const SQLITE_METRICS_SCRIPT = `
import { Database } from "bun:sqlite";
const dbPath = process.argv[1];
const project = process.argv[2];
function formatAge(epoch) {
  if (!epoch) return "never";
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - Number(epoch)) / 1000));
  if (deltaSeconds < 60) return deltaSeconds + "s";
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return deltaMinutes + "m";
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return deltaHours + "h";
  const deltaDays = Math.floor(deltaHours / 24);
  return deltaDays + "d";
}
const db = new Database(dbPath, { readonly: true });
const sessions = db.query("SELECT COUNT(*) AS c FROM sdk_sessions WHERE project = ?").get(project);
const latestObservation = db.query("SELECT MAX(created_at_epoch) AS ts FROM observations WHERE project = ?").get(project);
console.log(JSON.stringify({
  sessions: Number(sessions?.c) || 0,
  lastActivity: formatAge(latestObservation?.ts),
}));
db.close();
`;

interface Counts {
  project: string;
  observations: number;
  prompts: number;
  sessions: number;
  lastActivity: string;
}

function findCountsScript(): string | null {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".claude", "plugins", "marketplaces", "thedotmack", "plugin", "scripts", "statusline-counts.js"),
    path.join(home, ".claude", "plugins", "marketplaces", "thedotmack", "plugin", "scripts", "statusline-counts.bun.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function getCounts(currentDir: string): Counts | null {
  try {
    const script = findCountsScript();
    if (!script) return null;

    const raw = execFileSync("bun", [script, currentDir], {
      encoding: "utf8",
      timeout: 800,
      stdio: ["ignore", "pipe", "ignore"],
    });

    const parsed = JSON.parse(raw);
    const project = String(parsed.project || path.basename(currentDir) || "unknown");

    const dbPath = path.join(DATA_DIR, "claude-mem.db");
    let extra = { sessions: 0, lastActivity: "never" };
    if (fs.existsSync(dbPath)) {
      try {
        const extraRaw = execFileSync("bun", ["-e", SQLITE_METRICS_SCRIPT, dbPath, project], {
          encoding: "utf8",
          timeout: 800,
          stdio: ["ignore", "pipe", "ignore"],
        });
        extra = JSON.parse(extraRaw);
      } catch { /* no sqlite metrics */ }
    }

    return {
      project,
      observations: Number(parsed.observations) || 0,
      prompts: Number(parsed.prompts) || 0,
      sessions: Number(extra.sessions) || 0,
      lastActivity: String(extra.lastActivity || "never"),
    };
  } catch { return null; }
}

interface WorkerState {
  processing?: { isProcessing?: boolean; queueDepth?: number };
  queue?: { queue?: { totalFailed?: number; totalPending?: number; totalProcessing?: number } };
}

async function getWorkerState(): Promise<WorkerState | null> {
  try {
    const [processing, queue] = await Promise.all([
      fetch(`${WORKER_BASE_URL}/api/processing-status`, { signal: AbortSignal.timeout(800) }).then(r => r.json()),
      fetch(`${WORKER_BASE_URL}/api/pending-queue`, { signal: AbortSignal.timeout(800) }).then(r => r.json()),
    ]);
    return { processing: processing as WorkerState["processing"], queue: queue as WorkerState["queue"] };
  } catch { return null; }
}

function formatState(workerState: WorkerState | null, colors: LineColors): string {
  if (!workerState) return colorize("down", colors.critical || "#af7c84");

  const failed = Number(workerState.queue?.queue?.totalFailed) || 0;
  const pending = Number(workerState.queue?.queue?.totalPending) || 0;
  const processingCount = Number(workerState.queue?.queue?.totalProcessing) || 0;
  const depth = Number(workerState.processing?.queueDepth) || 0;

  if (failed > 0) return colorize(`failed ${failed}`, colors.critical || "#af7c84");
  if (workerState.processing?.isProcessing || processingCount > 0) {
    return colorize(`processing ${depth || processingCount}`, colors.warning || "#c0d18c");
  }
  if (pending > 0) return colorize(`queued ${pending}`, colors.warning || "#c0d18c");
  return colorize("idle", colors.ok || colors.label || "#416a63");
}

// --- Renderer ---

export const memLine: LineRenderer = {
  id: "mem",

  async render(payload: StatuslinePayload, config: HudConfig): Promise<string | null> {
    const lineConfig = getLineConfig(config, "mem", DEFAULTS) as MemLineConfig;
    if (lineConfig.enabled === false) return null;

    const colors = lineConfig.colors || {};
    const currentDir = payload.workspace?.current_dir || payload.cwd || process.cwd();
    const counts = getCounts(currentDir);
    if (!counts) return null;

    let workerState: WorkerState | null = null;
    try { workerState = await getWorkerState(); } catch { /* no worker */ }

    const hasSignal = counts.observations > 0 || counts.prompts > 0 || counts.sessions > 0 || workerState;
    if (!hasSignal) return null;

    return joinSegments(config, [
      colorize(String(lineConfig.label || "mem"), colors.label || "#416a63"),
      lineConfig.showProject ? secondary(counts.project, config) : null,
      lineConfig.showObservations ? secondary(`${counts.observations} obs`, config) : null,
      lineConfig.showPrompts ? secondary(`${counts.prompts} prompts`, config) : null,
      lineConfig.showSessions ? secondary(`${counts.sessions} sessions`, config) : null,
      lineConfig.showLastActivity ? secondary(`last ${counts.lastActivity}`, config) : null,
      lineConfig.showState ? formatState(workerState, colors) : null,
    ]);
  },
};