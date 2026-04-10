/**
 * Test suite for cc-hud-extended.
 * Uses Node.js built-in test runner.
 *
 * Run: npm run build && node --test test/test.mjs
 *
 * Requires dist/ to be built first (npm run build).
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

let ansi, configMod, gsd, gsdDetail, system, mem, gsdUtils;

before(async () => {
  ansi = await import(path.join(distDir, "utils", "ansi.js"));
  configMod = await import(path.join(distDir, "core", "config.js"));
  gsd = await import(path.join(distDir, "lines", "gsd.js"));
  gsdDetail = await import(path.join(distDir, "lines", "gsd-detail.js"));
  system = await import(path.join(distDir, "lines", "system.js"));
  mem = await import(path.join(distDir, "lines", "mem.js"));
  gsdUtils = await import(path.join(distDir, "lines", "gsd-utils.js"));
});

// --- ANSI Tests ---

describe("toAnsi", () => {
  it("converts hex color to ANSI 256-color escape", async () => {
    assert.equal(ansi.toAnsi("#416a63"), "\x1b[38;2;65;106;99m");
  });

  it("converts named token 'dim'", async () => {
    assert.equal(ansi.toAnsi("dim"), "\x1b[2m");
  });

  it("converts named token 'bold'", async () => {
    assert.equal(ansi.toAnsi("bold"), "\x1b[1m");
  });

  it("converts named token 'reset'", async () => {
    assert.equal(ansi.toAnsi("reset"), "\x1b[0m");
  });

  it("returns empty string for undefined", async () => {
    assert.equal(ansi.toAnsi(undefined), "");
  });

  it("returns empty string for invalid input", async () => {
    assert.equal(ansi.toAnsi("not-a-color"), "");
  });
});

describe("colorize", () => {
  it("wraps text in ANSI color codes", async () => {
    const result = ansi.colorize("hello", "#ff0000");
    assert.equal(result, "\x1b[38;2;255;0;0mhello\x1b[0m");
  });

  it("returns plain text when no color", async () => {
    assert.equal(ansi.colorize("hello", undefined), "hello");
  });
});

describe("secondary", () => {
  it("applies secondary color from config", async () => {
    const result = ansi.secondary("text", { colors: { secondary: "dim" } });
    assert.equal(result, "\x1b[2mtext\x1b[0m");
  });

  it("defaults to dim when no secondary color", async () => {
    const result = ansi.secondary("text", {});
    assert.equal(result, "\x1b[2mtext\x1b[0m");
  });
});

describe("joinSegments", () => {
  it("joins non-null segments with colored separator", async () => {
    const result = ansi.joinSegments({ separator: " | ", colors: { secondary: "dim" } }, ["a", "b", "c"]);
    assert.ok(result.includes("a"));
    assert.ok(result.includes("b"));
    assert.ok(result.includes("c"));
  });

  it("filters out null segments", async () => {
    const result = ansi.joinSegments({ separator: " • " }, ["a", null, "c"]);
    assert.ok(!result.includes("null"));
    assert.ok(result.includes("a"));
    assert.ok(result.includes("c"));
  });

  it("uses default separator when not specified", async () => {
    const result = ansi.joinSegments({}, ["x", "y"]);
    assert.ok(result.includes("x"));
    assert.ok(result.includes("y"));
  });
});

describe("stripAnsi", () => {
  it("removes ANSI escape codes", async () => {
    const colored = "\x1b[38;2;65;106;99mhello\x1b[0m \x1b[2mworld\x1b[0m";
    assert.equal(ansi.stripAnsi(colored), "hello world");
  });

  it("leaves plain text untouched", async () => {
    assert.equal(ansi.stripAnsi("plain text"), "plain text");
  });
});

describe("link (OSC 8)", () => {
  it("creates OSC 8 hyperlink", async () => {
    const result = ansi.link("click me", "https://example.com");
    assert.ok(result.includes("\x1b]8;;https://example.com\x1b\\"));
    assert.ok(result.includes("click me"));
    assert.ok(result.endsWith("\x1b]8;;\x1b\\"));
  });

  it("creates file:// link", async () => {
    const result = ansi.link("my-project", "file:///home/user/project");
    assert.ok(result.includes("\x1b]8;;file:///home/user/project\x1b\\"));
  });
});

// --- Config Tests ---

describe("loadConfig", () => {
  it("returns default config when no file exists", async () => {
    const cfg = configMod.loadConfig("/nonexistent/path/config.json");
    assert.equal(cfg.separator, " • ");
    assert.equal(cfg.baseHud?.enabled, true);
    assert.ok(Array.isArray(cfg.lineOrder));
  });

  it("merges partial config over defaults", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const tmpPath = path.join(os.tmpdir(), `cc-hud-test-${Date.now()}.json`);
    await fs.writeFile(tmpPath, JSON.stringify({ separator: " | " }));
    try {
      const cfg = configMod.loadConfig(tmpPath);
      assert.equal(cfg.separator, " | ");
      assert.equal(cfg.baseHud?.enabled, true); // default preserved
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  });
});

describe("getLineConfig", () => {
  it("merges user config over defaults", async () => {
    const hudConfig = { lines: { test: { enabled: false, label: "custom" } } };
    const defaults = { enabled: true, label: "default" };
    const result = configMod.getLineConfig(hudConfig, "test", defaults);
    assert.equal(result.enabled, false);
    assert.equal(result.label, "custom");
  });

  it("returns defaults when no user config", async () => {
    const hudConfig = {};
    const defaults = { enabled: true, label: "default" };
    const result = configMod.getLineConfig(hudConfig, "nonexistent", defaults);
    assert.equal(result.enabled, true);
    assert.equal(result.label, "default");
  });
});

// --- Line Renderer Contract Tests ---

describe("LineRenderer contract", () => {
  it("all built-in lines have id and async render", async () => {
    const lines = [gsd.gsdLine, gsdDetail.gsdDetailLine, system.systemLine, mem.memLine];
    for (const line of lines) {
      assert.equal(typeof line.id, "string");
      assert.ok(line.id.length > 0, `${line.id} should have a non-empty id`);
      assert.equal(typeof line.render, "function", `${line.id} should have render method`);
    }
  });

  it("lines return null or string with empty payload", async () => {
    const emptyPayload = {};
    const cfg = configMod.loadConfig("/nonexistent/path/config.json");

    const gsdResult = await gsd.gsdLine.render(emptyPayload, cfg);
    assert.ok(gsdResult === null || typeof gsdResult === "string");

    const sysResult = await system.systemLine.render(emptyPayload, cfg);
    assert.ok(sysResult === null || typeof sysResult === "string");
  });

  it("lines handle null context_window gracefully", async () => {
    const payload = { context_window: { used_percentage: null } };
    const cfg = configMod.loadConfig("/nonexistent/path/config.json");
    const result = await gsd.gsdLine.render(payload, cfg);
    assert.ok(result === null || typeof result === "string");
  });
});

// --- GSD Utils Tests ---

describe("formatRelativeTime", () => {
  it("returns 'now' for very recent times", async () => {
    assert.equal(gsdUtils.formatRelativeTime(new Date()), "now");
  });

  it("returns minutes for times within an hour", async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000);
    assert.equal(gsdUtils.formatRelativeTime(fiveMinAgo), "5m");
  });

  it("returns hours for times within a day", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000);
    assert.equal(gsdUtils.formatRelativeTime(threeHoursAgo), "3h");
  });

  it("returns days for times within a week", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
    assert.equal(gsdUtils.formatRelativeTime(twoDaysAgo), "2d");
  });

  it("returns weeks for older times", async () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000);
    assert.equal(gsdUtils.formatRelativeTime(twoWeeksAgo), "2w");
  });
});

describe("resolveStatusColor", () => {
  it("returns critical for blocked status", async () => {
    assert.equal(gsdUtils.resolveStatusColor("blocked", { critical: "#a23552" }), "#a23552");
  });

  it("returns executing color for executing status", async () => {
    assert.equal(gsdUtils.resolveStatusColor("executing", { executing: "#416a63" }), "#416a63");
  });

  it("returns warning for planning status", async () => {
    assert.equal(gsdUtils.resolveStatusColor("planning", { warning: "#c0d18c" }), "#c0d18c");
  });

  it("returns label color as default", async () => {
    assert.equal(gsdUtils.resolveStatusColor("unknown", { label: "#416a63" }), "#416a63");
  });
});

// --- Integration: render cycle test ---

describe("Integration: render cycle", () => {
  it("completes within timeout budget", async () => {
    const payload = {
      model: { display_name: "TestModel" },
      context_window: { used_percentage: 42, remaining_percentage: 58 },
      workspace: { current_dir: "/tmp" },
    };
    const cfg = configMod.loadConfig("/nonexistent/path/config.json");

    const start = Date.now();
    const result = await gsd.gsdLine.render(payload, cfg);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 800, `GSD render took ${elapsed}ms, should be under 800ms`);
    assert.ok(result === null || typeof result === "string");
  });
});