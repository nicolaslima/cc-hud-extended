/**
 * GSD Detail line renderer (secondary).
 * Shows supplementary GSD project context: mode, blockers, todos, phase progress, last activity, updates.
 * Intended to appear below the primary gsd line for expanded project status.
 */
import fs from "node:fs";
import path from "node:path";
import type { StatuslinePayload, HudConfig, LineRenderer, LineConfig } from "../core/types.js";
import { colorize, secondary, joinSegments } from "../utils/ansi.js";
import { getLineConfig } from "../core/config.js";
import {
  resolveProjectRoot,
  parseState,
  getProjectConfig,
  getGsdUpdates,
  getPhaseProgress,
  getPendingTodosCount,
  formatRelativeTime,
  resolveStatusColor,
} from "./gsd-utils.js";

interface GsdDetailLineConfig extends LineConfig {
  showMode: boolean;
  showBlockers: boolean;
  showPendingTodos: boolean;
  showPhaseProgress: boolean;
  showLastActivity: boolean;
  showUpdates: boolean;
}

const DEFAULTS: GsdDetailLineConfig = {
  enabled: true,
  label: "gsd",
  colors: {
    label: "#416a63",
    executing: "#416a63",
    warning: "#c0d18c",
    critical: "#a23552",
  },
  showMode: true,
  showBlockers: true,
  showPendingTodos: true,
  showPhaseProgress: true,
  showLastActivity: true,
  showUpdates: true,
};

export const gsdDetailLine: LineRenderer = {
  id: "gsd-detail",

  async render(payload: StatuslinePayload, config: HudConfig): Promise<string | null> {
    const lineConfig = getLineConfig(config, "gsd-detail", DEFAULTS) as GsdDetailLineConfig;
    if (lineConfig.enabled === false) return null;

    const colors = lineConfig.colors || {};

    // 1. Detect GSD project
    const projectRoot = resolveProjectRoot(payload);
    if (!projectRoot) return null;

    const statePath = path.join(projectRoot, ".planning", "STATE.md");
    const hasStateFile = fs.existsSync(statePath);

    // 2. Parse project config
    const pConfig = getProjectConfig(projectRoot);

    const segments: (string | null)[] = [];

    // 3. Mode (from config.json)
    if (lineConfig.showMode && pConfig.mode) {
      segments.push(secondary(pConfig.mode, config));
    }

    // 4. STATE.md-based components
    if (hasStateFile) {
      const state = parseState(statePath);
      if (state) {
        if (lineConfig.showBlockers && state.blockers.length > 0) {
          segments.push(colorize(`${state.blockers.length} blocked`, colors.critical || "#a23552"));
        }
        if (lineConfig.showLastActivity && state.lastActivity) {
          const relTime = formatRelativeTime(state.lastActivity.date);
          segments.push(secondary(`${relTime}`, config));
        }
      }
    }

    // 5. Phase progress bar (from ROADMAP.md)
    if (lineConfig.showPhaseProgress) {
      const progress = getPhaseProgress(projectRoot);
      if (progress) {
        segments.push(secondary(`${progress.bar} ${progress.current}/${progress.total}`, config));
      }
    }

    // 6. Pending todos count (from filesystem + STATE.md)
    if (lineConfig.showPendingTodos) {
      let fsCount = getPendingTodosCount(projectRoot);
      let stateCount = 0;
      if (hasStateFile) {
        const state = parseState(statePath);
        if (state) stateCount = state.pendingTodosCount;
      }
      const total = Math.max(fsCount, stateCount);
      if (total > 0) {
        segments.push(secondary(`${total} todo${total > 1 ? "s" : ""}`, config));
      }
    }

    // 7. GSD update warnings
    if (lineConfig.showUpdates) {
      const updates = getGsdUpdates();
      if (updates.updateAvailable) segments.push(colorize("⬆ update", colors.warning || "#c0d18c"));
      if (updates.staleHooks) segments.push(colorize("⚠ stale", colors.critical || "#a23552"));
    }

    // Only show detail line if there's meaningful content
    const hasContent = segments.some(s => s !== null);
    if (!hasContent) return null;

    // Prepend label
    segments.unshift(colorize(String(lineConfig.label || "gsd"), colors.label || "#416a63"));

    return joinSegments(config, segments);
  },
};