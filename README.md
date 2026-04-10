# cc-hud-extended

Modular, extensible statusline extension for [Claude Code](https://code.claude.com).

Adds custom information lines (GSD progress, system metrics, claude-mem state, and more) alongside or without [claude-hud](https://github.com/jarrodwatts/claude-hud).

## Quick Start

Get running in **under 1 minute**:

```bash
curl -fsSL https://raw.githubusercontent.com/nicolaslima/cc-hud-extended/main/install.sh | bash
```

The installer guides you through selecting which lines and components to enable, then restart Claude Code. The HUD appears below your input field.

## Prerequisites

- [x] [Node.js](https://nodejs.org) 18+
- [x] [Claude Code](https://code.claude.com) CLI

## Install

### One-command install (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/nicolaslima/cc-hud-extended/main/install.sh | bash
```

The installer will:
1. Download the latest release from GitHub
2. Ask which lines to enable (GSD, Memory, System)
3. Ask which GSD components to show (Phase, Task, Blockers, etc.)
4. Ask the display order of lines
5. Configure `~/.claude/settings.json` automatically
6. Display config file paths when done

### Manual install (from source)

```bash
git clone https://github.com/nicolaslima/cc-hud-extended.git
cd cc-hud-extended
npm install && npm run build
```

Then add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/cc-hud-extended/dist/index.js"
  }
}
```

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/nicolaslima/cc-hud-extended/main/uninstall.sh | bash
```

## Features

- **GSD line** — Project phase, status, blockers, task, context usage, phase progress, and update availability
- **System line** — Memory, CPU, and disk usage with color-coded thresholds
- **Memory line** — Claude-mem observation counts, sessions, and worker state
- **Custom lines** — Drop `.js` files in `~/.config/cc-hud-extended/lines/` to add your own
- **claude-hud integration** — Wraps claude-hud output (if installed) and appends custom lines
- **Standalone mode** — Works without claude-hud installed
- **Interactive installer** — Choose which lines and components to enable during setup

## Configuration

Config file: `~/.config/cc-hud-extended/config.json` (or set `CC_HUD_CONFIG` env var to a custom path).

### Default configuration

```json
{
  "separator": " • ",
  "colors": { "secondary": "dim" },
  "baseHud": {
    "enabled": true,
    "filterPhaseLine": true,
    "filterMemoryLine": true,
    "separatorReplace": " • "
  },
  "lines": {
    "gsd": {
      "enabled": true,
      "label": "gsd",
      "colors": { "label": "#416a63", "executing": "#517243", "warning": "#c0d18c", "critical": "#af7c84" },
      "showPhase": true,
      "showPlan": true,
      "showPercent": true,
      "showStatus": true,
      "showMode": true,
      "showTask": true,
      "showBlockers": true,
      "showPendingTodos": true,
      "showPhaseProgress": true,
      "showLastActivity": true,
      "showContext": true,
      "showUpdates": true
    },
    "mem": {
      "enabled": true,
      "label": "mem",
      "colors": { "label": "#416a63", "ok": "#416a63", "warning": "#c0d18c", "critical": "#af7c84" },
      "showProject": true,
      "showObservations": true,
      "showState": true
    },
    "system": {
      "enabled": true,
      "label": "sys",
      "colors": { "label": "#416a63", "warning": "#c0d18c", "critical": "#af7c84" },
      "showMemory": true,
      "showCpu": true,
      "showDisk": true
    }
  },
  "lineOrder": ["gsd", "mem", "system"]
}
```

### GSD line components

Each component can be toggled independently with `show*` config keys:

| Component | Config key | Source | Example output |
|---|---|---|---|
| Phase | `showPhase` | `.planning/STATE.md` | `2 of 5 (Foundation)` |
| Plan | `showPlan` | `.planning/STATE.md` | `plan 3/8` |
| Percent | `showPercent` | `.planning/STATE.md` | `38%` |
| Status | `showStatus` | `.planning/STATE.md` | `in progress` / `blocked` |
| Mode | `showMode` | `.planning/config.json` | `interactive` / `autonomous` |
| Task | `showTask` | `~/.claude/todos/` | `Fixing GSD visibility` |
| Blockers | `showBlockers` | `.planning/STATE.md` | `2 blocked` |
| Pending Todos | `showPendingTodos` | `.planning/todos/pending/` | `3 todos` |
| Phase Progress | `showPhaseProgress` | `.planning/ROADMAP.md` | `▓▓▓▓░░░░░░ 2/5` |
| Last Activity | `showLastActivity` | `.planning/STATE.md` | `3h` / `2d` |
| Context | `showContext` | Claude Code payload | `█████░░░░░ 30%` |
| Updates | `showUpdates` | GSD update cache | `⬆ update` / `⚠ stale` |

Status colors: `executing` (green), `planning`/`ready` (yellow), `blocked` (pink).

### Color tokens

Colors support hex values (`#416a63`) or named tokens (`dim`, `bold`).

### Display order

Change the `lineOrder` array to reorder lines:

```json
{ "lineOrder": ["system", "gsd", "mem"] }
```

## Custom Lines

Drop a `.js` file in `~/.config/cc-hud-extended/lines/`:

```js
// ~/.config/cc-hud-extended/lines/time.js
module.exports = {
  id: "time",

  async render(payload, config) {
    const lineConfig = config.lines?.time || {};
    if (lineConfig.enabled === false) return null;

    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    return `🕐 ${time}`;
  },
};
```

Then add `"time"` to `lineOrder` in your config.

## Line Renderer Interface

Every line (built-in or custom) implements:

```ts
interface LineRenderer {
  readonly id: string;
  render(payload: StatuslinePayload, config: HudConfig): Promise<string | null>;
}
```

- Return a string to display the line
- Return `null` to skip the line

## Architecture

```
src/
  index.ts          # Entry point: reads stdin, renders all lines
  core/
    types.ts        # Shared types (StatuslinePayload, LineRenderer, HudConfig)
    config.ts       # Config loader with layered defaults
    stdin.ts        # Stdin reader with timeout guard
    base-hud.ts     # claude-hud bridge (optional)
  lines/
    index.ts        # Line registry and custom line loader
    gsd.ts          # GSD progress line
    system.ts       # System metrics line
    mem.ts          # Claude-mem line
  utils/
    ansi.ts         # Shared ANSI color utilities
```

## License

MIT