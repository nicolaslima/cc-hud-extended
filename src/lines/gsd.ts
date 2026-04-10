/**
 * GSD (Get Shit Done) primary line renderer.
 * Shows core project status: phase, plan, percent, status, task, context usage.
 * Secondary details (mode, blockers, todos, phase progress, last activity, updates)
 * are handled by gsd-detail.ts.
 */
import fs from "node:fs";
import path from "node:path";
import type { StatuslinePayload, HudConfig, LineRenderer, LineConfig, LineColors } from "../core/types.js";
import { colorize, secondary, joinSegments } from "../utils/ansi.js";
import { getLineConfig } from "../core/config.js";
import {
  resolveProjectRoot,
  parseState,
  getProjectName,
  getCurrentTask,
  getContextUsage,
  resolveStatusColor,
} from "./gsd-utils.js";

interface GsdLineConfig extends LineConfig {
  showPhase: boolean;
  showPlan: boolean;
  showPercent: boolean;
  showStatus: boolean;
  showTask: boolean;
  showContext: boolean;
}

const DEFAULTS: GsdLineConfig = {
  enabled: true,
  label: "gsd",
  colors: {
    label: "#416a63",
    executing: "#416a63",
    warning: "#c0d18c",
    critical: "#a23552",
  },
  showPhase: true,
  showPlan: true,
  showPercent: true,
  showStatus: true,
  showTask: true,
  showContext: true,
};

export const gsdLine: LineRenderer = {
  id: "gsd",

  async render(payload: StatuslinePayload, config: HudConfig): Promise<string | null> {
    const lineConfig = getLineConfig(config, "gsd", DEFAULTS) as GsdLineConfig;
    if (lineConfig.enabled === false) return null;

    const colors = lineConfig.colors || {};
    const segments: (string | null)[] = [
      colorize(String(lineConfig.label || "gsd"), colors.label || "#416a63"),
    ];

    // 1. Detect GSD project
    const projectRoot = resolveProjectRoot(payload);
    const statePath = projectRoot ? path.join(projectRoot, ".planning", "STATE.md") : null;
    const hasStateFile = statePath !== null && fs.existsSync(statePath);
    const hasGsdProject = !!projectRoot;

    // 2. STATE.md-based components
    if (hasStateFile && statePath) {
      const state = parseState(statePath);
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
    } else if (projectRoot && lineConfig.showPhase) {
      // Fallback when no STATE.md: show project name instead of phase
      segments.push(secondary(getProjectName(projectRoot), config));
    }

    // 3. Current task from Claude Code's todos
    const task = getCurrentTask(payload);

    // Only show this line if there's meaningful GSD content
    const hasContent = hasGsdProject || (task && lineConfig.showTask);

    if (!hasContent) return null;

    if (task && lineConfig.showTask) {
      segments.push(colorize(task, colors.executing || "#416a63"));
    }

    // 4. Context usage progress bar
    if (lineConfig.showContext && hasGsdProject) {
      const ctx = getContextUsage(payload);
      if (ctx) {
        segments.push(`${ctx.ansi}${ctx.bar} ${ctx.used}%\x1b[0m`);
      }
    }

    return joinSegments(config, segments);
  },
};