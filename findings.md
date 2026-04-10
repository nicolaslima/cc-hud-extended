# Findings: Statusline Best Practices Compliance

## Official Statusline Spec (code.claude.com/docs/en/statusline)

### Configuration Format
```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 2,
    "refreshInterval": 30
  }
}
```

### Data Flow
- Claude Code pipes JSON session data via stdin
- Script reads JSON, extracts fields, prints to stdout
- Multiple lines: each echo/print = separate row
- Colors: ANSI escape codes (\033[32m, etc.)
- Links: OSC 8 escape sequences for clickable text

### Update Triggers
- After each assistant message
- Permission mode change
- Vim mode toggle
- Debounced at 300ms
- In-flight execution cancelled if new update triggers
- `refreshInterval` re-runs command every N seconds during idle

### Complete JSON Schema
```json
{
  "cwd": "/current/working/directory",
  "session_id": "abc123...",
  "session_name": "my-session",
  "transcript_path": "/path/to/transcript.jsonl",
  "model": { "id": "claude-opus-4-6", "display_name": "Opus" },
  "workspace": {
    "current_dir": "/current/working/directory",
    "project_dir": "/original/project/directory",
    "added_dirs": [],
    "git_worktree": "feature-xyz"
  },
  "version": "2.1.90",
  "output_style": { "name": "default" },
  "cost": {
    "total_cost_usd": 0.01234,
    "total_duration_ms": 45000,
    "total_api_duration_ms": 2300,
    "total_lines_added": 156,
    "total_lines_removed": 23
  },
  "context_window": {
    "total_input_tokens": 15234,
    "total_output_tokens": 4521,
    "context_window_size": 200000,
    "used_percentage": 8,
    "remaining_percentage": 92,
    "current_usage": {
      "input_tokens": 8500,
      "output_tokens": 1200,
      "cache_creation_input_tokens": 5000,
      "cache_read_input_tokens": 2000
    }
  },
  "exceeds_200k_tokens": false,
  "rate_limits": {
    "five_hour": { "used_percentage": 23.5, "resets_at": 1738425600 },
    "seven_day": { "used_percentage": 41.2, "resets_at": 1738857600 }
  },
  "vim": { "mode": "NORMAL" },
  "agent": { "name": "security-reviewer" },
  "worktree": {
    "name": "my-feature",
    "path": "/path/to/.claude/worktrees/my-feature",
    "branch": "worktree-my-feature",
    "original_cwd": "/path/to/project",
    "original_branch": "main"
  }
}
```

### Fields that may be absent
- `session_name`: only when set with --name or /rename
- `workspace.git_worktree`: only inside linked git worktree
- `vim`: only when vim mode enabled
- `agent`: only when running with --agent flag
- `worktree`: only during --worktree sessions
- `rate_limits`: only for Pro/Max after first API response

### Fields that may be null
- `context_window.current_usage`: null before first API call
- `context_window.used_percentage`, `remaining_percentage`: may be null early in session

## Current Payload Coverage (src/core/types.ts)

### Present
- model.id, model.display_name ✓
- workspace.current_dir ✓
- workspace.project_dir ✓ (added recently)
- workspace.added_dirs ✓ (added recently)
- cwd ✓
- session_id ✓
- context_window.* ✓ (partial)
- cost.total_cost_usd ✓
- cost.total_duration_ms ✓

### Missing
- session_name ✗
- workspace.git_worktree ✗
- version ✗
- output_style ✗
- cost.total_api_duration_ms ✗
- cost.total_lines_added ✗
- cost.total_lines_removed ✗
- context_window.total_input_tokens ✗
- context_window.total_output_tokens ✗
- context_window.context_window_size ✗
- context_window.current_usage (full object) ✗
- exceeds_200k_tokens ✗
- rate_limits ✗
- vim ✗
- agent ✗
- worktree ✗
- transcript_path ✗

## Performance Analysis

### Blocking Operations (per render cycle)
| Operation | File | Time |
|-----------|------|------|
| spawnSync for claude-hud | base-hud.ts | up to 5000ms timeout |
| execFileSync("vm_stat") | system.ts | ~10-50ms |
| setTimeout(150ms) for CPU | system.ts | 150ms |
| execFileSync("df") | system.ts | ~10-50ms |
| execFileSync("bun", script) | mem.ts | up to 800ms x2 |
| fetch(worker URL) | mem.ts | up to 800ms |

Total worst case: ~6.5s (way beyond 300ms debounce)
Realistic with claude-hud + mem: ~2-3s
Without external deps: ~200-300ms

### Recommendations
1. Wrap all I/O in Promise.race with 500ms total timeout
2. Cache CPU metrics (5s TTL)
3. Parallelize independent I/O operations
4. Reduce base-hud timeout to 2000ms