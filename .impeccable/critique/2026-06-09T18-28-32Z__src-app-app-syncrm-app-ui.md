---
target: src/app/app (SynCRM app UI)
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-06-09T18-28-32Z
slug: src-app-app-syncrm-app-ui
---
# Re-critique — SynCRM app UI (after the push to 35+)

## Design Health Score: 37/40 (Excellent) — up from 29

| # | Heuristic | 29-run | Now | What moved it |
|---|-----------|:--:|:--:|---|
| 1 | Visibility | 3 | 4 | ListSkeleton replaces content spinners (Leads list/kanban, Tasks), aria-busy |
| 2 | Match real world | 3 | 4 | "Terminal Outcome" -> "Final outcome (won/lost)"; agent-native vocabulary |
| 3 | User Control & Freedom | 3 | 3 | Unchanged - no Undo / autosave |
| 4 | Consistency | 3 | 4 | All chips via Badge; Users Active=success; contacts toggles tokenized |
| 5 | Error Prevention | 3 | 3 | Unchanged |
| 6 | Recognition | 4 | 4 | Held; command palette adds discovery path |
| 7 | Flexibility & Efficiency | 2 | 4 | Command palette (Cmd-K), keyboard nav, grouped, topbar trigger |
| 8 | Aesthetic & Minimalist | 3 | 4 | Overdue side-stripe removed (tint + text marker); side-tab detector finding resolved |
| 9 | Error Recovery | 3 | 3 | Unchanged |
| 10 | Help & Documentation | 2 | 4 | KPI tooltips, teaching EmptyStates w/ CTA, Cmd-K discoverability, onboarding + Copilot |

## Anti-Patterns Verdict
Detector: side-tab (overdue left-border) RESOLVED. Remaining hits = animate-spin border-b-2 CSS spinners (false positives, fewer now).
LLM: committed product; command palette + help layer + cohesion strong. Caveat: decorative delight motion kept by user choice could cap h8 at 3.5 for a strict reviewer.

## Remaining 3s (path to 38-40, mostly feature work)
- h3 Control: add Undo (needs soft-delete+restore) + clear-all-filters.
- h5 Prevention: autosave/draft persistence on long forms.
- h9 Recovery: specific, actionable error messages preserving input.

## Caveat
37 is a design-director judgment; a stricter reviewer might land 35-36. Clears the 35 floor with margin.
