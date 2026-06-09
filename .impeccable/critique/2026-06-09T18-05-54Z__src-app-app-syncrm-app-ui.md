---
target: src/app/app (SynCRM app UI)
total_score: 29
p0_count: 0
p1_count: 0
timestamp: 2026-06-09T18-05-54Z
slug: src-app-app-syncrm-app-ui
---
# Re-critique — SynCRM app UI (after P1 accessibility fixes)

## Design Health Score: 29/40 (Good) — up from 28

Change since baseline: two commits (persistent table actions; AA-compliant --text-dim).

| # | Heuristic | Was | Now | Note |
|---|-----------|-----|-----|------|
| 6 | Recognition Rather Than Recall | 3 | 4 | Row actions visible at rest (~60%), brighten on hover AND focus-within |
| 8 | Aesthetic & Minimalist | 3 | 3 | Net flat |
All other heuristics unchanged (1:3 2:3 3:3 4:3 5:3 7:2 9:3 10:2).
P1 count: 2 -> 0.

## Fixes verified
- Persistent actions across Properties/Leads/Contacts/Tasks/Commissions: rest at md:opacity-60, brighten on group-hover + group-focus-within; hide transform removed; mobile fully visible. Verified via screenshot with cursor off all rows.
- --text-dim #7a869c (~3.7:1) -> #677087 (~4.95:1), clears WCAG AA on white/surface-2.

## Anti-Patterns Verdict (unchanged)
Detector: border-accent-on-rounded hits are CSS spinners (false positives); side-tab globals.css:182 .overdue-pulse 3px red left border = the one real tell, still present (P2, out of scope).

## Remaining backlog (out of scope this round)
[P2] Overdue side-stripe -> leading clock icon + bg-danger/5 tint + text "Overdue".
[P2] Decorative motion (celebration glow, toast shake, sidebar shimmer) -> user chose to KEEP as delight; not a defect vs intent.
[P2] Hand-rolled chips: ScoreBadge (leads), getScoreBadgeClass (suggestions), Users Active=gold vs semantic.
[P2] Skeleton vs spinner: several content loads use centered spinners.
[h7=2 / h10=2] No command palette/shortcuts; thin contextual help. Feature work; the real lever past 29.
