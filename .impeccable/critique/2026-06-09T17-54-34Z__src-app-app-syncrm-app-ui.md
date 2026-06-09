---
target: src/app/app (SynCRM app UI)
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-06-09T17-54-34Z
slug: src-app-app-syncrm-app-ui
---
# Design Critique — SynCRM app UI (post-redesign)

## Design Health Score: 28/40 (Good)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Toasts/live dots/breadcrumbs solid; some content loads use spinners not skeletons |
| 2 | Match System / Real World | 3 | CRM vocab natural; "terminal outcome"/"under contract" leak engineering phrasing |
| 3 | User Control & Freedom | 3 | Cancel everywhere, drawer Esc, type-to-confirm deletes; no global undo |
| 4 | Consistency & Standards | 3 | One Button/Badge/Table/formatMoney; residual hand-rolled score chips + Active=gold |
| 5 | Error Prevention | 3 | Type-to-confirm destructive deletes strong; currency inputs validated |
| 6 | Recognition Rather Than Recall | 3 | Labeled nav, breadcrumbs, bottom tabs; table actions lean on hover |
| 7 | Flexibility & Efficiency | 2 | No command palette/shortcuts; primary table actions mouse-only |
| 8 | Aesthetic & Minimalist | 3 | Calm gold-only, surface depth; decorative motion legacy exceeds motion=state |
| 9 | Error Recovery | 3 | Error boundaries + inline errors; some generic "Failed to..." copy |
| 10 | Help & Documentation | 2 | Onboarding tour + Copilot FAB; no contextual metric/status help |

## Anti-Patterns Verdict
Not AI-looking overall; earns product familiarity (one button/badge/money system, distinctive gold-on-cool-neutral + green sidebar identity avoiding SaaS-cream/dark-teal reflexes).
Remaining tells: decorative motion (celebration-glow, toast shake/draw, sidebar shimmer, attention-shake); overdue red left-border (banned side-stripe).
Detector (detect.mjs, exit 2, 5 findings): side-tab globals.css:182 .overdue-pulse = REAL; 4x border-accent-on-rounded in leads/page.tsx = FALSE POSITIVES (CSS loading spinners). No live overlay presented (headless env).

## Priority Issues
[P1] Table row actions hidden until hover (desktop) across Properties/Leads/Contacts/Tasks/Commissions (md:opacity-0 group-hover). Fails keyboard/low-vision + discoverability. Fix: opacity-60 always + group-focus-within reveal. -> /impeccable adapt
[P1] --text-dim #7a869c fails AA 4.5:1 on white (~4.0), ~22 content uses (timestamps/hints/dashes). Fix: darken to ~#646f87 or promote to text-muted. -> /impeccable polish
[P2] Decorative motion exceeds motion=state (celebration-glow, toast-x-shake/check-draw, sidebar-underline-glow, attention-shake). Fix: keep skeletons/transitions/toasts, drop shimmer/shake/glow. -> /impeccable quieter
[P2] Overdue side-stripe (.overdue-pulse 3px red left border, detector-confirmed). Fix: leading clock icon + bg-danger/5 tint + text "Overdue". -> /impeccable polish
[P2] Hand-rolled status/score chips bypass system: ScoreBadge (leads), getScoreBadgeClass (property-suggestions); Users Active=gold default vs semantic elsewhere. Fix: route through Badge; Active=success. -> /impeccable polish

## Persona Red Flags
Alex (power): no Cmd-K/shortcuts; one-row-at-a-time stage changes; mouse-only row actions.
Sam (a11y): text-dim contrast <4.5; hover-hidden actions; overdue conveyed by color+motion with no text equivalent.
Casey (mobile): bottom tabs good (thumb zone) but page CTAs at top (out of reach); long New-Lead form has no visible draft persistence.

## Minor Observations
- Skeletons mixed with centered content spinners.
- Admin config tables keep internal h-scroll vs card treatment.
- Contacts modal tag toggles still raw bg-gray-100.
