/**
 * ANSI color utilities shared across all line renderers.
 * Converts hex color strings or named tokens to ANSI escape sequences.
 */

const HEX_PATTERN = /^#?([0-9a-fA-F]{6})$/;

/** Convert a color token to an ANSI escape sequence */
export function toAnsi(token: string | undefined): string {
  if (!token) return "";
  if (token === "dim") return "\x1b[2m";
  if (token === "bold") return "\x1b[1m";
  if (token === "reset") return "\x1b[0m";

  const match = token.trim().match(HEX_PATTERN);
  if (!match) return "";

  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/** Wrap text in ANSI color codes */
export function colorize(text: string, token: string | undefined): string {
  const ansi = toAnsi(token);
  return ansi ? `${ansi}${text}\x1b[0m` : text;
}

/** Apply secondary/dim styling to text */
export function secondary(text: string, config: { colors?: { secondary?: string } }): string {
  return colorize(text, config.colors?.secondary || "dim");
}

/** Join non-empty segments with a colored separator */
export function joinSegments(
  config: { separator?: string; colors?: { secondary?: string } },
  segments: (string | null | undefined)[]
): string {
  const sep = colorize(config.separator || " • ", config.colors?.secondary || "dim");
  return segments.filter(Boolean).join(sep) as string;
}

/** Strip ANSI escape codes from a string */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Create an OSC 8 hyperlink.
 * Requires a terminal that supports hyperlinks (iTerm2, Kitty, WezTerm).
 * Cmd+click on macOS, Ctrl+click on Windows/Linux to open.
 */
export function link(text: string, url: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}