# cc-hud-extended

Modular, extensible statusline extension for [Claude Code](https://code.claude.com).

Adds custom information lines (GSD progress, system metrics, claude-mem state, and more) alongside or without [claude-hud](https://github.com/jarrodwatts/claude-hud).

## Features

- **GSD line** — Shows project status, current task, context usage, and update availability. Works with or without `.planning/STATE.md`
- **System line** — Memory, CPU, and disk usage with color-coded thresholds
- **Memory line** — Claude-mem observation counts, sessions, and worker state
- **Custom lines** — Drop `.js` files in `~/.config/cc-hud-extended/lines/` to add your own
- **claude-hud integration** — Wraps claude-hud output (if installed) and appends custom lines
- **Standalone mode** — Works without claude-hud installed
- **Fully configurable** — Colors, labels, visibility toggles per line

## Install

One command — no clone, no build:

```bash
curl -fsSL https://raw.githubusercontent.com/nicolaslima/cc-hud-extended/main/install.sh | bash
```

Then **restart Claude Code**. The HUD will appear below your input field.

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/nicolaslima/cc-hud-extended/main/uninstall.sh | bash
```

### Manual install (from source)

```bash
git clone https://github.com/nicolaslima/cc-hud-extended.git
cd cc-hud-extended
npm install && npm run build
# Then add to ~/.claude/settings.json:
# "statusLine": { "type": "command", "command": "node /path/to/cc-hud-extended/dist/index.js" }
```

## Configuration

Config file: `~/.config/cc-hud-extended/config.json` (or set `CC_HUD_CONFIG` env var).

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
      "colors": { "label": "#416a63", "executing": "#517243" },
      "showPhase": true,
      "showPlan": true,
      "showPercent": true,
      "showStatus": true,
      "showTask": true,
      "showContext": true,
      "showUpdates": true
    },
    "system": {
      "enabled": true,
      "label": "sys",
      "colors": { "label": "#416a63", "warning": "#c0d18c", "critical": "#af7c84" },
      "showMemory": true,
      "showCpu": true,
      "showDisk": true
    },
    "mem": {
      "enabled": true,
      "label": "mem",
      "colors": { "label": "#416a63", "ok": "#416a63" },
      "showProject": true,
      "showObservations": true,
      "showState": true
    }
  },
  "lineOrder": ["gsd", "mem", "system"]
}
```

### Color tokens

Colors can be hex (`#416a63`) or named tokens (`dim`, `bold`).

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