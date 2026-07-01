---
name: proposal-generator
description: Use when the user wants to create, build, write, or refine a client proposal, quote, pricing sheet, sales one-pager, statement of work, or order form as a polished, branded PDF. Covers cover pages, benefit/feature cards, pricing tables, white-label/add-on options, phased rollout, and sign-off / acceptance blocks with tick boxes and signature lines. Produces a print-ready A4 PDF from branded HTML rendered via headless Chromium, using a reusable design system (tri-colour brand bar, gradient "glowing" accent stripes, left-stripe cards, sign-off order form). Not for slide decks (use a pptx workflow) or long-form contracts.
version: 1.0.0
user-invocable: true
argument-hint: "[client name] [product] — e.g. 'Jawitz Properties SynCRM'"
---

# Proposal Generator

Create polished, **branded PDF proposals** for a specific client. The output is an
A4 document generated from HTML and rendered to PDF with headless Chromium — so it
looks designed, prints cleanly, and can be emailed as-is.

## When to apply
- A client proposal, quote, pricing sheet, or sales one-pager is requested.
- The user wants an approval/sign-off document consolidating a discussed offer.
- Any "make it branded / make it inviting / send a PDF" ask around pricing + benefits.

## Workflow (do this)
1. **Gather the essentials** — client name, product/scope, audience (technical vs.
   founder), pricing tiers, any add-ons (e.g. white-label), and tone (pitch vs.
   post-discussion approval). Ask only for what's genuinely missing; otherwise proceed.
2. **Write a Python generator** that emits one HTML file, linking (or inlining)
   `assets/proposal.css`. Embed the client/brand **logo as base64** so the PDF is
   self-contained. One `<section class="page">` per A4 page.
3. **Render to PDF** with the pre-installed Chromium:
   ```bash
   CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome   # or `which chromium`
   "$CHROME" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
     --print-to-pdf=OUT.pdf "file://$PWD/proposal.html"
   ```
4. **Visually verify** before sending: screenshot the HTML
   (`--screenshot=full.png --window-size=794,<n*1123>`) and read the PNG. Confirm the
   PDF page count matches the number of `.page` sections (no blank overflow pages —
   keep each page's content under ~255 mm tall).
5. **Deliver the PDF.** Only include the HTML source if the user asks for it.

## Design system — the signature look
Full stylesheet: **`assets/proposal.css`**. Keep these details — they are the
"micro-adjustments" that make it feel crafted. Every one is driven by a single
brand gradient `--grad` so recolouring for a new client is a one-line change.

- **Tri-colour brand bar** (`.tribar`) across the top of *every* page — the recurring
  brand signature (orange → gold → green by default).
- **Gradient underline accent** (`.accent`) — a short glowing gradient rule under each
  section heading. Small, but it ties every section to the brand.
- **Left "glow" stripe cards** (`.card::before`, `.step::before`) — a 5px vertical
  gradient stripe down the left edge of benefit/step cards.
- **Pricing cards** (`.price`) with a gradient cap (`.top`); the recommended tier gets
  `.feat` — a gold border plus a soft coloured **glow shadow**
  (`box-shadow:0 8px 24px rgba(236,164,0,.14)`) and an optional `.badge`.
- **Cover** (`.cover`) — radial navy gradient, a logo "chip", a gradient `.pill`, big
  title, and a metadata row (Prepared by / Product / Date).
- **Gradient dot** (`.dot`) on callouts; dashed separators between list items.
- **Sign-off / order form** (`.confirm` + `.opt` + `.sign`) — tick boxes (`.box`) for
  each selectable option with the price on the right, then `Name / Signature / Date`
  underlines. Use this to close an approval proposal instead of a "contact us" block.

### Brand tokens
Recolour by editing `:root` in `assets/proposal.css` (or override in the HTML):
`--orange --gold --green --leaf` feed `--grad`; `--navy` is the cover; `--ink
--muted --bg --line` are neutrals; `--font` the typeface. Swap the base64 logo in the
`.chip`. Default palette = LayerSync (warm-orange → gold → green).

## Content & tone rules
- **Match the ask.** A post-meeting approval doc is a *consolidation*, not a pitch —
  keep it direct, drop marketing hype and "let's meet" CTAs, and end with sign-off.
- **Only claim real features.** Never invent capabilities to fill space; describe what
  the product actually does. If a capability is minor, state it modestly.
- **Keep pricing unambiguous.** Show period (e.g. /month), what each tier covers, and
  spell out add-ons (e.g. "one-time build — a monthly plan still applies").
- **Non-technical audience** → plain language, benefit-led, short sentences.
- **Verify names, prices, and contacts** against what the user gave; don't carry over
  stale details between drafts.

## Reference layout (typical order)
1. Cover · 2. Overview + what it does (cards) · 3. Options/add-ons + pricing ·
4. Approval & sign-off (tick boxes + signature). Scale up or down to fit the deal.
