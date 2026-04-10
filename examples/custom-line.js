/**
 * Example custom line for cc-hud-extended.
 *
 * To use: copy this file to ~/.config/cc-hud-extended/lines/time.js
 * It will be auto-discovered and rendered after the built-in lines.
 *
 * Each custom line must export an object with:
 *   - id: string (unique identifier)
 *   - render(payload, config): async function returning string | null
 */

const { colorize, secondary, joinSegments } = require("../../dist/utils/ansi");

module.exports = {
  id: "time",

  async render(payload, config) {
    const lineConfig = config.lines?.time || {};
    if (lineConfig.enabled === false) return null;

    const label = lineConfig.label || "time";
    const colors = lineConfig.colors || {};
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    return joinSegments(config, [
      colorize(label, colors.label || "#446a92"),
      secondary(time, config),
      secondary(date, config),
    ]);
  },
};