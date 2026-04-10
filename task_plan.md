# Task Plan: Statusline Best Practices Compliance + Release

## Goal
Corrigir todos os problemas identificados na análise de conformidade com as melhores práticas do statusline do Claude Code, adicionar testes, e criar release v1.1.0.

## Issues Found (Priority Order)

### CRITICAL
| # | Issue | File | Impact |
|---|-------|------|--------|
| C1 | `require()` em contexto ESM | `src/lines/index.ts:26` | Custom lines nunca carregam |
| C2 | Operações bloqueantes >300ms | `system.ts`, `mem.ts`, `base-hud.ts` | Statusline pode nunca renderizar |

### HIGH
| # | Issue | File | Impact |
|---|-------|------|--------|
| H1 | StatuslinePayload incompleto | `src/core/types.ts` | Dados úteis indisponíveis |
| H2 | Erros vão para stdout | `src/index.ts:69` | Erros aparecem como texto na statusline |

### MEDIUM
| # | Issue | File | Impact |
|---|-------|------|--------|
| M1 | Sem `refreshInterval` no install | `install.sh` | Dados ficam stale |
| M2 | Sem links OSC 8 | `src/` | Perde interatividade |
| M3 | `sampleCpuUsage()` bloqueia 150ms | `src/lines/system.ts` | Latência a cada render |

### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| L1 | `padding` não configurável | `install.sh` | Gap menor de UX |
| L2 | Fallback visual ausente para null | `src/lines/system.ts` | Linha some em vez de placeholder |
| L3 | Shell expansion safety | `install.sh:367` | JSON escape frágil |

## Phases

### Phase 1: Critical Fixes [pending]
- [ ] C1: Converter `require()` para `import()` dinâmico em `src/lines/index.ts`
- [ ] C2: Adicionar timeout global de render (500ms) e paralelizar I/O em `system.ts` e `mem.ts`
- [ ] C2: Reduzir timeout do base-hud spawnSync de 5000ms para 2000ms
- [ ] C2: Cache CPU sampling em `system.ts` com TTL de 5s
- [ ] H2: Mover erros de stdout para stderr em `src/index.ts`

### Phase 2: Payload + Features [pending]
- [ ] H1: Completar `StatuslinePayload` com todos os campos oficiais
- [ ] M1: Adicionar `refreshInterval` no install script e documentação
- [ ] M2: Adicionar suporte a OSC 8 links (função helper em `ansi.ts`)
- [ ] M3: Otimizar CPU sampling com cache
- [ ] L2: Adicionar fallback visual para dados null (ex: "—" placeholder)

### Phase 3: Polish [pending]
- [ ] L1: Adicionar `padding` como opção no install script
- [ ] L3: Melhorar shell expansion safety no install.sh

### Phase 4: Tests [pending]
- [ ] Criar suite de testes com Node.js built-in test runner
- [ ] Testar parse de payload com campos null/ausentes
- [ ] Testar custom line loader (ESM)
- [ ] Testar ANSI color functions
- [ ] Testar config merge com defaults
- [ ] Testar renderização de cada linha com payload mock
- [ ] Testar timeout de stdin

### Phase 5: Build + Release [pending]
- [ ] Compilar TypeScript
- [ ] Rodar testes
- [ ] Atualizar versão em package.json para 1.1.0
- [ ] Atualizar README com novos campos e opções
- [ ] Commit + tag v1.1.0
- [ ] Push para origin

## Decisions
- Decision: Usar `import()` dinâmico com fallback para `require()` (compatibilidade CJS/ESM)
- Decision: Timeout global de render = 500ms (dentro do debounce de 300ms do Claude Code)
- Decision: Cache CPU com TTL de 5s para evitar 150ms de latência a cada render
- Decision: Links OSC 8 como função helper em ansi.ts, não obrigatório nos renderers
- Decision: Versão da release = 1.1.0 (patch + minor features)