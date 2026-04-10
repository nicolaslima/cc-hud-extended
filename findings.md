# Findings: GSD Dual-Line Analysis

## Current GSD line output (all 12 components enabled)
```
gsd • 2 of 5 (Foundation) • plan 3/8 • 38% • in progress • 4h • 2 blocked • interactive • ▓▓▓▓░░░░░░ 2/5 • 3 todos • █████░░░░░ 30%
```
That's ~200+ chars — exceeds most terminal widths for statusline.

## Architecture analysis

### Data flow
1. `findProjectRoot()` — walks up from payload dirs to find `.planning/`
2. `parseState()` — reads STATE.md for phase/status/plan/percent/blockers/activity
3. `getProjectConfig()` — reads config.json for mode
4. `getPhaseProgress()` — reads ROADMAP.md for phase bar
5. `getPendingTodosCount()` — counts files in `.planning/todos/pending/`
6. `getCurrentTask()` — reads `~/.claude/todos/` for active task
7. `getContextUsage()` — reads payload for context bar
8. `getGsdUpdates()` — reads update cache

### Code duplication risk
If we create gsd-detail.ts, both files need:
- `findProjectRoot()` — project detection logic
- `parseState()` — STATE.md parser
- `getProjectConfig()` — config.json reader

**Solution:** Extract these into `gsd-utils.ts` shared module.

### Primary vs Secondary split

| Primary (gsd) | Secondary (gsd:detail) |
|---|---|
| Phase | Mode |
| Plan | Blockers |
| Percent | Pending Todos |
| Status | Phase Progress |
| Task | Last Activity |
| Context | Updates |

Primary = "where am I right now?" (position + action)
Secondary = "what's around me?" (context + health)

## Key insight
The LineRenderer interface returns a single string (one line). To show two lines, we need two separate renderers. This is architecturally clean — each line is independent, has its own config, and can be independently enabled/disabled/reordered.

## Config example after split
```json
{
  "lines": {
    "gsd": {
      "enabled": true,
      "label": "gsd",
      "showPhase": true, "showPlan": true, "showPercent": true,
      "showStatus": true, "showTask": true, "showContext": true
    },
    "gsd-detail": {
      "enabled": true,
      "label": "gsd",
      "showMode": true, "showBlockers": true, "showPendingTodos": true,
      "showPhaseProgress": true, "showLastActivity": true, "showUpdates": true
    }
  },
  "lineOrder": ["gsd", "gsd-detail", "mem", "system"]
}
```