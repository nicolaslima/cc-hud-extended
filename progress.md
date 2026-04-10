# Progress Log

## Session 2026-04-10

- Fixed GSD line bug: `workspace.project_dir` not being checked (only `current_dir`)
- Root cause: Claude Code sends `project_dir` as main project, `current_dir` as working dir
- Added `project_dir` to `dirsToCheck` in gsd.ts
- Also added `added_dirs` to types.ts workspace interface
- Verified: GSD line now appears for dev-tea project
- Verified: GSD line does NOT appear for non-GSD directories

## Session 2026-04-10 (continued)
- Added 5 new GSD line components:
  - showBlockers: parses Blockers/Concerns from STATE.md
  - showPendingTodos: counts files in .planning/todos/pending/
  - showPhaseProgress: reads ROADMAP.md for phase progress bar
  - showMode: shows mode from config.json (interactive/autonomous)
  - showLastActivity: relative time since last activity from STATE.md
- Rewrote install.sh as interactive installer
- Updated config.example.json, README
- Fixed plan regex to prioritize "Plan:" line over "Phase:" line
- Removed process.cwd() from dirsToCheck to prevent false positives
- Made project name fallback respect showPhase flag
- All tests passing (with/without GSD, empty payload, invalid JSON, high context)
- Documentation reviewed against Diataxis README guidelines
- Pushed 3 commits to origin/main

## Session 2026-04-10 (continued - dual-line analysis)
- Analyzing complexity of splitting GSD into two lines (primary + secondary)
- Recommended: Option A (separate gsd-detail line renderer)
- Primary: phase, plan, percent, status, task, context
- Secondary: mode, blockers, todos, phase progress, last activity, updates