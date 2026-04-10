# Task Plan: GSD Dual-Line — Primary + Secondary

## Goal
Analisar a complexidade e viabilidade de dividir a linha GSD em duas linhas separadas:
- **gsd** (primary): status do projeto, posição, contexto
- **gsd:detail** (secondary): blockers, todos, phase progress, last activity

## Analysis

### Current State
- A single GSD line can show 12 components when all enabled
- With all components on: `gsd • 2 of 5 (Foundation) • plan 3/8 • 38% • in progress • 4h • 2 blocked • interactive • ▓▓▓▓░░░░░░ 2/5 • 3 todos • █████░░░░░ 30%`
- That's potentially 200+ chars — too long for most terminals

### Proposed Architecture

**Option A: Separate Line Renderer (gsd-detail.ts)**
- Create a new `gsd-detail` line renderer
- Shares data sources with `gsd` line (same .planning/ reads)
- Independent enable/disable in config
- Line order: `["gsd", "gsd:detail", "mem", "system"]`

**Option B: Auto-split within gsd.ts**
- Same renderer produces 2 lines when `dualLine: true`
- Primary line: label, phase, plan, percent, status, task, context
- Secondary line: blockers, todos, phase progress, last activity, mode, updates
- Simpler config but less flexibility

**Option C: Line composition (shared data module)**
- Extract data fetching into `gsd-data.ts` (shared module)
- `gsd.ts` renders primary line
- `gsd-detail.ts` renders secondary line
- Both read from same cached data (avoid double I/O)

### Complexity Assessment

| Aspect | Option A | Option B | Option C |
|--------|----------|----------|----------|
| New files | 1 (gsd-detail.ts) | 0 | 2 (gsd-data.ts + gsd-detail.ts) |
| Config changes | +1 line entry | +1 bool flag | +1 line entry |
| Data I/O duplication | Yes (reads .planning/ twice) | No | No (shared cache) |
| Flexibility | High (independent order) | Medium (always together) | High |
| Implementation time | ~30 min | ~15 min | ~45 min |

### Recommendation
**Option A** — é a mais simples e direta. A duplicação de I/O é irrelevante porque o statusline já faz múltiplos reads síncronos pequenos, e o filesystem cache do OS resolve isso.

### Primary vs Secondary Classification

**Primary (gsd):** Core status — always visible when GSD project detected
- Phase: `2 of 5 (Foundation)`
- Plan: `plan 3/8`
- Percent: `38%`
- Status: `in progress` / `blocked`
- Task: `Fixing GSD visibility`
- Context: `█████░░░░░ 30%`

**Secondary (gsd:detail):** Supplementary — details on demand
- Mode: `interactive`
- Blockers: `2 blocked`
- Pending Todos: `3 todos`
- Phase Progress: `▓▓▓▓░░░░░░ 2/5`
- Last Activity: `4h`
- Updates: `⬆ update` / `⚠ stale`

## Decisions
- Decision: implement as Option A (separate gsd-detail line renderer)
- Decision: share no code between lines initially (YAGNI — refactor later if needed)
- Decision: gsd-detail has its own DEFAULTS with all secondary components enabled by default
- Decision: both lines share the same .planning/ detection logic (findProjectRoot)

## Phase 1: Implement gsd-detail line [pending]
- [ ] Create src/lines/gsd-detail.ts with secondary components
- [ ] Extract findProjectRoot + parseState into shared module (avoid code duplication)
- [ ] Add gsd-detail to BUILT_IN_LINES in index.ts
- [ ] Update DEFAULT lineOrder to include "gsd-detail"
- [ ] Update config.example.json
- [ ] Update install.sh prompts
- [ ] Update README

## Phase 2: Build, test, commit [pending]
- [ ] Compile TypeScript
- [ ] Test with payload (primary + secondary lines)
- [ ] Test with gsd-detail disabled
- [ ] Test with only gsd-detail enabled
- [ ] Commit + push