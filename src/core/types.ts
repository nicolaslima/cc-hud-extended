/** Payload sent by Claude Code to statusline commands via stdin */
export interface StatuslinePayload {
  model?: {
    id?: string;
    display_name?: string;
  };
  workspace?: {
    current_dir?: string;
  };
  cwd?: string;
  session_id?: string;
  context_window?: {
    context_window_size?: number;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
    used_percentage?: number | null;
    remaining_percentage?: number | null;
  };
  cost?: {
    total_cost_usd?: number | null;
    total_duration_ms?: number | null;
  } | null;
  rate_limits?: {
    five_hour?: { used_percentage?: number | null; resets_at?: number | null } | null;
    seven_day?: { used_percentage?: number | null; resets_at?: number | null } | null;
  } | null;
  transcript_path?: string;
}

/** Configuration for a single line's colors */
export interface LineColors {
  label?: string;
  ok?: string;
  warning?: string;
  critical?: string;
  executing?: string;
}

/** Configuration for a single line */
export interface LineConfig {
  enabled?: boolean;
  label?: string;
  colors?: LineColors;
  [key: string]: unknown;
}

/** Top-level configuration */
export interface HudConfig {
  separator?: string;
  colors?: {
    secondary?: string;
  };
  baseHud?: {
    enabled?: boolean;
    filterPhaseLine?: boolean;
    filterMemoryLine?: boolean;
    separatorReplace?: string | null;
  };
  lines?: Record<string, LineConfig & Record<string, unknown>>;
  lineOrder?: string[];
  customLinesDir?: string;
}

/** Render options passed to line renderers */
export interface RenderOptions {
  configPath?: string;
  config?: HudConfig;
}

/** The interface every line module must implement */
export interface LineRenderer {
  /** Unique identifier for this line */
  readonly id: string;
  /** Render the line. Return null to skip. */
  render(payload: StatuslinePayload, config: HudConfig): Promise<string | null>;
}