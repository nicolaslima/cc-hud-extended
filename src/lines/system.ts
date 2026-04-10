/**
 * System metrics line renderer.
 * Shows memory, CPU, and disk usage with color-coded thresholds.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { StatuslinePayload, HudConfig, LineRenderer, LineConfig, LineColors } from "../core/types.js";
import { colorize, secondary, joinSegments } from "../utils/ansi.js";
import { getLineConfig } from "../core/config.js";

interface SystemLineConfig extends LineConfig {
  showMemory: boolean;
  showCpu: boolean;
  showDisk: boolean;
}

const DEFAULTS: SystemLineConfig = {
  enabled: true,
  label: "sys",
  colors: {
    label: "#416a63",
    warning: "#c0d18c",
    critical: "#a23552",
  },
  showMemory: true,
  showCpu: true,
  showDisk: true,
};

interface Metrics {
  memory: string;
  memoryPercent: number;
  cpu: string;
  cpuPercent: number;
  disk: string;
  diskPercent: number;
}

function formatBytes(bytes: number, decimals = 1): string {
  return `${(bytes / 1024 ** 3).toFixed(decimals)}G`;
}

function classifyPercent(value: number): "critical" | "warning" | "secondary" {
  if (value >= 90) return "critical";
  if (value >= 70) return "warning";
  return "secondary";
}

function resolveMetricColor(level: string, colors: LineColors): string {
  if (level === "critical") return colors.critical || "#a23552";
  if (level === "warning") return colors.warning || "#c0d18c";
  return "dim";
}

function metricSegment(label: string, value: string, level: string, colors: LineColors, config: HudConfig): string {
  return `${secondary(label, config)} ${colorize(value, resolveMetricColor(level, colors))}`;
}

// --- Platform-specific metrics ---

function getDarwinMemoryMetrics(): { memory: string; memoryPercent: number } | null {
  try {
    const raw = execFileSync("vm_stat", [], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const pageSizeMatch = raw.match(/page size of (\d+) bytes/);
    const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 0;
    if (!pageSize) return null;

    const values: Record<string, number> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^:]+):\s+("?)([\d.]+)\2\.?$/);
      if (m) values[m[1].trim()] = Number(m[3]) || 0;
    }

    const totalMem = os.totalmem();
    const usedPages = (values["Pages active"] || 0) + (values["Pages wired down"] || 0) + (values["Pages occupied by compressor"] || 0);
    const usedMem = usedPages * pageSize;
    const memoryPercent = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;
    return { memory: `${formatBytes(usedMem, 2)}/${formatBytes(totalMem, 1)}`, memoryPercent };
  } catch { return null; }
}

function getLinuxMemoryMetrics(): { memory: string; memoryPercent: number } | null {
  try {
    const raw = fs.readFileSync("/proc/meminfo", "utf8");
    const values: Record<string, number> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB$/);
      if (m) values[m[1]] = Number(m[2]) || 0;
    }
    const totalKb = values.MemTotal || 0;
    const availableKb = values.MemAvailable || 0;
    if (!totalKb || !availableKb) return null;
    const totalBytes = totalKb * 1024;
    const usedBytes = Math.max(0, totalBytes - availableKb * 1024);
    const memoryPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
    return { memory: `${formatBytes(usedBytes, 2)}/${formatBytes(totalBytes, 1)}`, memoryPercent };
  } catch { return null; }
}

async function sampleCpuUsage(): Promise<number> {
  const start = os.cpus().map(c => ({ ...c.times }));
  await new Promise(resolve => setTimeout(resolve, 150));
  const end = os.cpus().map(c => ({ ...c.times }));
  let idle = 0;
  let total = 0;
  for (let i = 0; i < start.length; i++) {
    const before = start[i];
    const after = end[i];
    const idleDelta = after.idle - before.idle;
    const totalDelta = Object.keys(after).reduce((sum, key) => sum + (after[key as keyof typeof after] - before[key as keyof typeof before]), 0);
    idle += idleDelta;
    total += totalDelta;
  }
  return total <= 0 ? 0 : ((total - idle) / total) * 100;
}

function getDiskUsage(currentDir: string): number {
  try {
    const raw = execFileSync("df", ["-k", currentDir || process.cwd()], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const row = raw.trim().split("\n").at(-1) || "";
    const columns = row.trim().split(/\s+/);
    return Number((columns[4] || "0").replace("%", "")) || 0;
  } catch { return 0; }
}

async function getMetrics(currentDir: string): Promise<Metrics | null> {
  const memMetrics = process.platform === "darwin" ? getDarwinMemoryMetrics() :
    process.platform === "linux" ? getLinuxMemoryMetrics() : null;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.max(0, totalMem - freeMem);

  const memory = memMetrics || {
    memory: `${formatBytes(usedMem, 2)}/${formatBytes(totalMem, 1)}`,
    memoryPercent: totalMem > 0 ? (usedMem / totalMem) * 100 : 0,
  };

  const cpuPercent = await sampleCpuUsage();
  const diskPercent = getDiskUsage(currentDir);

  return {
    ...memory,
    cpu: `${Math.round(cpuPercent)}%`,
    cpuPercent,
    disk: `${Math.round(diskPercent)}%`,
    diskPercent,
  };
}

// --- Renderer ---

export const systemLine: LineRenderer = {
  id: "system",

  async render(payload: StatuslinePayload, config: HudConfig): Promise<string | null> {
    const lineConfig = getLineConfig(config, "system", DEFAULTS) as SystemLineConfig;
    if (lineConfig.enabled === false) return null;

    const colors = lineConfig.colors || {};
    const currentDir = payload.workspace?.current_dir || payload.cwd || process.cwd();
    const metrics = await getMetrics(currentDir);
    if (!metrics) return null;

    return joinSegments(config, [
      colorize(String(lineConfig.label || "sys"), colors.label || "#416a63"),
      lineConfig.showMemory ? metricSegment("mem", metrics.memory, classifyPercent(metrics.memoryPercent), colors, config) : null,
      lineConfig.showCpu ? metricSegment("cpu", metrics.cpu, classifyPercent(metrics.cpuPercent), colors, config) : null,
      lineConfig.showDisk ? metricSegment("disk", metrics.disk, classifyPercent(metrics.diskPercent), colors, config) : null,
    ]);
  },
};