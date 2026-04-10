/** Payload sent by Claude Code to statusline commands via stdin */
export interface StatuslinePayload {
  model?: {
    id?: string;
    display_name?: string;
  };
  workspace?: {
    current_dir?: string;
    project_dir?: string;
    added_dirs?: string[];
    git_worktree?: string;
  };
  cwd?: string;
  session_id?: string;
  session_name?: string;
  transcript_path?: string;
  version?: string;
  output_style?: {
    name?: string;
  };
  cost?: {
    total_cost_usd?: number | null;
    total_duration_ms?: number | null;
    total_api_duration_ms?: number | null;
    total_lines_added?: number | null;
    total_lines_removed?: number | null;
  } | null;
  context_window?: {
    total_input_tokens?: number | null;
    total_output_tokens?: number | null;
    context_window_size?: number;
    used_percentage?: number | null;
    remaining_percentage?: number | null;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
  };
  exceeds_200k_tokens?: boolean;
  rate_limits?: {
    five_hour?: { used_percentage?: number | null; resets_at?: number | null } | null;
    seven_day?: { used_percentage?: number | null; resets_at?: number | null } | null;
  } | null;
  vim?: {
    mode?: string;
  };
  agent?: {
    name?: string;
  };
  worktree?: {
    name?: string;
    path?: string;
    branch?: string;
    original_cwd?: string;
    original_branch?: string;
  };
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