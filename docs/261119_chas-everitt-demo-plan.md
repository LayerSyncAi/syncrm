# Chas Everitt demo: build plan

Version 2, 19 Nov 2026, revised after an independent review. Source: *Chas Everitt Demo: Scope and Build Brief* (17 Nov 2026, 18 pages) and the ClickUp task "Chas Everitt demo".

Direction given on 19 Nov:
- keep Next.js
- run the backend and hosting on Cloudflare, on the cheapest plan that is reliable
- reuse SynCRM code, and build only what is new

---

## 1. Decisions to confirm before we start

1. **This departs from the brief.** Sections 6 and 9 say to build the demo as a demo organisation on the existing Sync Estate platform (Convex), "not a separate copy of the code". A Cloudflare backend means a **new, separate app** that copies SynCRM code. Tadiwa and the team should agree to this, and to what happens after signing: either the real project grows from this app, or it moves back onto Sync Estate.
2. **Timeline: about 11 working days**, or 9 with the cuts in section 9. The brief's 5 days assumed we only add to the live platform. The brief's "no changes in the last 24 hours" rule is included. The meeting date decides which.
3. **Cost: build on Free ($0), then pay $5 for one month for rehearsals and the meeting.**
   - The Free plan is fine for building.
   - Free allows 100k database row writes a day across the whole account. Each demo reset uses a few thousand, so a heavy rehearsal day could run out, and writes would then fail until midnight UTC. A failure like that on meeting day would sink the demo.
   - Free also allows only 10 ms of CPU per request.
   - Workers Paid ($5) removes both risks. Cancel it after the meeting.
4. **A neutral web address.** A `*.workers.dev` address includes our Cloudflare account name, which shows in the phone's address bar in walkthrough step 1. Use either a neutral custom domain (about $10 a year) or a new Cloudflare account with a neutral subdomain (free).

## 2. What the brief's "In Sync Dev today" column really looks like

Developers were asked to confirm this column on day 1. These answers were checked against the code.

| Screen | Brief says | Actually in the code |
|---|---|---|
| Login and branding | Needs work | There is build-time white label (`src/config/brand.ts`) and per-org white label (`orgBranding`, `src/lib/org-theme.ts`). Brand names appear 231 times in 73 files in `src`. They also appear in `public/manifest.json`, `sw.js`, logo file names and the PDF text ("Reverse in SyncFinance" in `sale-statement.tsx:120`). |
| Admin/Agent switch | Exists | The toggle exists (`topbar.tsx`, `agentMode`). **It does not restrict Sync Dev:** `dev/access.ts:41` lets any admin manage, whatever the mode. |
| Dashboard | Yes, plus 2 new tables | Yes (`convex/dev/dashboard.ts`). The enquiries-by-stage table, branch table and agent Today list are missing. |
| Stand map | Yes | Yes (`components/dev/inventory.tsx`). **It shows every buyer and reservation name to every agent** (`inventory.ts:56-59`). Only `sizeSqm` exists; there is no stage or phase field. |
| Stand details | Check | Reserve, release, sell and edit exist. A reservation is free text (name and phone), **not linked to an enquiry**, and **lapses on an `until` date**. The brief says it stays until sold or released. "Interested enquiries" does not exist. |
| Enquiries | In SynCRM, needs linking | List and drag board (with touch drag) exist, with stages configurable per org. **Missing:** a follow-up date field, the 7-day no-contact flag, score decay over time (the score only changes when the lead is edited), and any link to stands. |
| Buyers | Yes | Yes (`components/sales/instalments-view.tsx`). |
| Sale and payment plan | Yes | Yes. `buildPlan` gives exactly the brief's 1,083.33 / 1,083.37 example, and `planState` pays the oldest instalment first. Making a sale does not touch the lead. |
| Reminders | Buttons exist | A reminder engine exists. Its "due soon" and "overdue" steps don't match the brief's 3 days before, on the day, and 7 days after. There is no "Sent (demo)" preview flow. |
| Commissions | Partly | Commission per development only. There is no per-agent view. |
| Viewings and show days | Check | The SynCRM viewing form is a **signed property-viewing form**. It has no interest level and no offer field, and does not move the stage. **Show days do not exist.** |
| Reports | Check | CRM and Finance reports exist, but none matches the brief's six. Excel export **does exist** (`xlsx` in `leads/export/page.tsx`, `lib/stay/export.ts`), so we reuse it. |
| Import | Yes | Lead import exists, but its phone matching is not international (077… does not match +26377…) and it **flags duplicates instead of updating** them, which section 3.14 requires. |
| Finance ledger | Yes, rename | It is a full double-entry trust ledger (about 4,900 lines), far more than the demo needs (section 6.9). |
| Website | New | **New.** SynCRM's `websiteEnquiries` are LayerSync's own marketing enquiries. There is no round-robin assignment anywhere. |

## 3. Architecture

### 3.1 One Cloudflare Worker: a static Next.js app plus an API

```
Phone or laptop
   │
   ▼
Cloudflare Worker  (one deploy, on a neutral domain)
   ├── Static assets: Next.js 16 app built with output: "export"   ← free, uses no Worker CPU
   │     /login   /app/...   /site/<private-slug>
   │     _headers sets X-Robots-Tag: noindex on everything; robots.txt disallows all
   └── /api/*   Hono router
         ├── /api/rpc/<name>   queries and mutations in the Convex style (logged in)
         ├── /api/version      a small change counter for live updates
         └── /api/public/*     website stands and the "I'm interested" form (no login)
               │
               ▼
            D1 (SQLite) through Drizzle, location hint weur (closest to Harare)
```

**Why a static export rather than server rendering (OpenNext)?**
- SynCRM screens already run in the browser, so server rendering adds nothing.
- Static pages are free and use no Worker CPU.
- OpenNext, which supports Next.js 16, stays as the fallback.

**Static export rules:**
- Dynamic routes become query strings, for example `/app/buyers/view?id=…`. Pages that read `useSearchParams` get a `<Suspense>` boundary.
- `next/image` uses `unoptimized`.
- Fonts use `next/font`, which is bundled at build time.
- Login redirects happen in the browser.
- No `manifest.json` and no service worker, because a cached old build in the meeting is a real risk.

**Branding is fixed at build time** using the existing `src/config/brand.ts` system: name, logo, colours, page title and favicon. These are therefore right before any data loads, including on the login page. The brief's "branding through organisation settings" assumed a shared platform. In a separate app, build-time settings are simpler and more reliable.

### 3.2 Reusing the SynCRM screens: an API shaped like Convex

The screens call `useQuery(api.x.y, args)` and `useMutation(...)` directly, in 176 files with no wrapper in between.

**Server side**
- A registry of functions that **keeps SynCRM's names and return shapes**, for example `dev.inventory.list`, `dev.sales.listStands` and `dev.sales.receivePayment`. A sale still returns `paidToDate`, `balance`, `overdue` and `nextDueDate`.
- Each function has a zod argument check and a handler `(ctx, args)`. `ctx` gives `db` (Drizzle), the current user and access rules.
- One route serves them all: `POST /api/rpc/:name`.

**Client side** (`src/lib/backend.ts`)
- Exports `api` (a typed proxy built from the registry), `useQuery`, `useMutation`, `ConvexError` (with `.data`), `FunctionReturnType`, and `Id<"…">` (a string type that keeps SynCRM's table names).
- `useQuery` must:
  - keep the previous data while it refetches, so screens don't flash loading placeholders after every change
  - support `"skip"`
  - fetch again when the change counter moves
- `src/lib/errors.ts` is pointed at our `ConvexError`.

**Per-screen fixes we expect**
- Remove Finance-only branches in `sales/modals.tsx` (accounts, refund, interest, reversals).
- Bring along `stay/page-header` and `finance/use-pdf`.
- Re-key the kanban to the fixed stages, and move a dragged card locally straight away so it does not snap back while waiting for the refetch.

### 3.3 Live updates

- `meta.version` goes up on every write.
- `useQuery` polls `GET /api/version` (one row) every 4 seconds while the tab is visible, and fetches again when the number changes. The device that made the change fetches straight away.
- Cost: 5 devices for 8 hours is about 36,000 requests, against 100,000 free.
- To limit database reads, each handler runs **one query or one `batch()`**. Every list has indexes, and dashboard and report queries use aggregates. One round trip from Zimbabwe takes about 150 ms, so this matters for speed too.
- Upgrade path if 4 seconds feels slow: a Durable Object push. It is free at this scale and about 80 lines.
- The website reads stand status on every page load (brief section 4.5).

### 3.4 Correct writes without transactions

D1 has no interactive transactions, and Drizzle's `db.transaction()` does not work on it. Every write uses this pattern:

- **Claim first with a guarded statement, then check whether a row changed:**
  - reserve: `UPDATE stands SET status='reserved' … WHERE id=? AND status='available'`
  - sell: the same, with `status IN ('available', 'reserved for this enquiry')`
  - If no row changed, show "This stand has just been taken".
- **Round robin:** `UPDATE settings SET nextAgentIndex = (nextAgentIndex+1) % n RETURNING nextAgentIndex`.
- **Phone dedupe:** a unique `phoneNorm` (international format) plus `INSERT … ON CONFLICT`.
- **The remaining writes** (history entry, notification, version bump) go in one `batch()`, which runs as a single transaction.

### 3.5 CPU and resets

- **Passwords:** PBKDF2-SHA256 through WebCrypto. Day 1 measures the CPU time at the planned iteration count (Workers allow at most 100,000) and fixes the number. The data is fictional, so a lower count is acceptable for the demo.
- **Sessions:** random tokens, stored hashed in D1.
- **Reset:** about 15 statements in one `batch()`. Each table is loaded from a single JSON parameter with `INSERT … SELECT … FROM json_each(?)`. This stays under both the 100-parameter cap and the 50-queries-per-request limit on Free.
- **PDF and Excel** are built in the browser.
- **Overdue, next due and score** are worked out when read, so there are no cron jobs.
- **Dates:** "Today" is always calculated in `Africa/Harare` time.

### 3.6 Cost

| Need | Cloudflare product | Per month |
|---|---|---|
| App, API and website | Workers + Static Assets | $0 while building; **$5 (Paid) for the rehearsal and meeting month** |
| Database | D1 + Drizzle | Included |
| Live updates | Polling (Durable Object as the upgrade) | Included |
| Logo and images | Bundled static files (no uploads, so no R2) | $0 |
| Email, SMS, WhatsApp | None. The brief says nothing is really sent ("Sent (demo)" plus a PDF download). | $0 |
| Web address | A neutral domain (about $10 a year) or a new account's neutral `workers.dev` | $0–1 |
| Privacy | noindex header, robots.txt, a hard-to-guess website path, login for the system | $0 |

## 4. The new repository

- A private repo with a neutral name, for example `LayerSyncAi/ce-demo`.
- **Stack:**
  - Next.js 16 and React 19 (static export) with Tailwind v4
  - Hono, Drizzle with `drizzle-kit`, and Wrangler
  - zod, date-fns, lucide-react, sonner, framer-motion, jsPDF with jspdf-autotable, `xlsx`, and Vitest
- **Copied from SynCRM and adapted:**
  - UI: `components/ui/*`, the `globals.css` tokens, `config/brand.ts`, and the layout (sidebar and topbar, cut down).
  - Pure libraries:
    - `finance/lib.ts` (`buildPlan`, `planState`, `round2`)
    - `dev/lib.ts`, `lib/leadImportMatching.ts`, `lib/csv.ts`, `lib/temperature.ts`, `lib/report-export.ts`, `lib/finance/pdf.ts`
    - SynCRM's existing `xlsx` export code
    - SynCRM's international phone-number formatting, moved out of `sms.ts`
  - Screens:
    - `dev/inventory.tsx`
    - `sales/instalments-view.tsx`, `sale-statement.tsx`, `modals.tsx`
    - `leads/kanban-board.tsx`
    - the lead list and enquiry page, the import wizard and `notification-bell.tsx`, all trimmed
- **Not copied:** Stay, Worth, SyncMedia, Notify, PropertyBook, the portal, the AI assistant, the mobile app, double-entry Finance, platform admin, the PWA files.
- **Brand guard:** a test fails the build if `\b(sync ?(estate|dev|finance|rm|media)|layersync)\b|back to hub` (ignoring case) appears in the built `out/` text, a generated PDF, or a download file name. The pattern deliberately does not match plain "sync", so it won't catch `async` in the code.

## 5. Data model (D1)

The demo has one organisation, so there is no `orgId` column.

```
settings        depositPct, defaultMonths, reminderDaysBefore (3), reminderDaysAfter (7),
                staleDays (7), commissionPct (5), websiteDevelopmentId, websitePhase,
                websiteSlug, nextAgentIndex, demoAgentId
branches        id, name
users           id, name, email, phone, passwordHash, role (admin|agent), branchId
sessions        tokenHash, userId, viewAsAgentId, expiresAt
developments    id, name, location, currency, developerName (made up)
stands          id, developmentId, number, sizeSqm, landStage (serviced|foundation), phase,
                price, status (available|reserved|sold), reservedForEnquiryId,
                reservedByUserId, reservedAt, saleId
                  (no expiry date: a reservation stays until sold or released)
enquiries       id, name, phone, phoneNorm UNIQUE, email, source, budget, preferredSize,
                preferredLandStage, stage (new|contacted|viewing|offer|won|lost),
                agentId, lastContactAt, nextFollowUpAt, offerAmount, notes, createdAt
enquiryStands   enquiryId, standId, via (website|agent|showday), createdAt
activities      id, enquiryId, userId, kind (call|message|viewing|stage|note|showday|
                reserve|release|sale|payment|cancel), at, detail JSON
showDays        id, developmentId, date, agentIds JSON
viewings        id, enquiryId, showDayId?, userId, date, standIds JSON,
                interest (hot|warm|cold), offerMade, offerAmount, notes
sales           id, standId, enquiryId (always set), agentId, price, deposit, months,
                schedule JSON, status (active|paid|cancelled), cancelReason, cancelledAt
payments        id, saleId, receiptNo, date, amount, method (cash|bank|mobile), reference,
                commission, heldForDeveloper, paidToDeveloper, createdAt
commissionPayouts id, agentId, amount, date, note
notifications   id, userId, kind, title, link, readAt, createdAt
messages        id, kind (payment|followup), saleId?, enquiryId?, step (before|due|after|
                followup|stale), toName, channel, body, status (preview|sent_demo), createdAt
meta            version
```

**Rules the review flagged:**

- **A buyer is always an enquiry.** "New sale" with a buyer typed in fresh creates an enquiry at `won` first. Every buyer then has a source and a history, and the Lead sources report can count sales.
- **"Own" means `enquiry.agentId`.** An agent sees names only on stands linked to their own enquiries or sales.
- **Agent scope** applies whenever the user is an agent, or an Admin has switched to agent view (`viewAsAgentId`). That includes the price, payment, cancel and import permissions.
- **A price change applies to new sales only.** It updates `stands.price`, and each sale keeps its own `price`.
- **Duplicate phone numbers:**
  - A website enquiry for a phone that already belongs to an enquiry adds the stand of interest to that enquiry.
  - If that phone belongs to a buyer, the website enquiry adds the stand of interest and notifies their agent.
  - A show-day visitor whose phone belongs to another agent's enquiry is added to the history of that enquiry. The capturing agent sees "Already with another agent". The visitor is never reassigned.
- **Cancelling a sale:** the sale becomes `cancelled` with a reason. The stand goes back to available and its `saleId` is cleared. The enquiry moves to `lost`. Commission already earned on payments received stays, because the money really came in. Later cancellations of real sales are a business rule to ask Chas Everitt about.
- **Reminders:** 3 days before, on the due date, and 7 days after, using the timings in settings. The steps already sent are tracked in `messages`. This replaces SynCRM's two-step `standRemindersDue`.

## 6. Build by area

**6.1 Login, shell and settings (Must)**
- **Login page:** logo, "Chas Everitt Development Management System", email, password and "Log in", nothing else.
- **Top bar:** page name, the Admin/Agent switch (Admin chooses "View as Rudo", the demo agent), search across enquiries, buyers and stands, the bell, and the user's name.
- **Menu:** Dashboard, Developments, Enquiries, Buyers, Commissions, Reports. An "Admin" group holds Import, Finance, Settings and Reset demo.
- **Settings screen:** deposit %, months, reminder days, stale days and commission %, which shows they are "not hard-coded".

**6.2 Roles and scoping (Must)**
- One `access(ctx)` helper is used by every handler.
- It follows the role table on brief page 3. A unit test covers each row.

**6.3 Dashboard (Must)**
- Summary line, stand cards, and money cards (overdue in red).
- Smart suggestion with "Send reminders".
- Enquiries by stage, and a branch table (Admin only).
- Agent Today list: follow-ups due, buyers due or overdue, and new website enquiries.
- Every card opens its filtered list.

**6.4 Developments and stand map (Must)**
- Port `inventory.tsx`, with the brief's tile colours, filters with counts, search, split bar and red dot.
- Add one stand, or a range using `parseStandNumbers`. Spreadsheet stand upload lives under Import.
- Development summary cards.
- Memoised tiles in a CSS grid. Virtualise only if 400 tiles lag on a mid-range Android phone.

**6.5 Stand details (Must)**
- Shows: details, reserved-for or buyer with the agent and a link, and interested enquiries.
- Actions:
  - reserve for one of the user's enquiries
  - sell
  - release (the person who reserved it, or Admin)
  - Admin edits size, stage and price
- Reserving moves the enquiry to Offer.

**6.6 Enquiries (Must)**
- **Ported:** the list and kanban (with a local move on drag), and the enquiry page with full history.
- **Actions:**
  - add by hand
  - log a call or message (updates `lastContactAt`, which clears the 7-day flag)
  - set a follow-up date
  - move stage
  - record a viewing
  - reserve a stand
  - make the sale
- **Score:** SynCRM's criteria plus points for a viewing or offer, minus points as days since last contact grow. Worked out when read.
- **When the sale is made:** the enquiry moves to `won`, leaves the list, and appears under Buyers with its history.

**6.7 Buyers, sale and payment plan (Must)**
- Port `instalments-view`, `sale-statement` and `modals`.
- **Sale form:** follows the brief's fields. Only available stands, or one reserved for this person, can be picked. Price is filled in, and only Admin can change it.
- **Receiving a payment (Admin):** pays the oldest item first, stores commission and held-for-developer on the payment, notifies the agent, and moves the counter.
- **Cancelling:** follows section 5.
- **Statement PDF:** the jsPDF renderer with the logo. "Email statement" logs "Sent (demo)" and offers the PDF.

**6.8 Reminders (Must)**
- "Send reminders" (dashboard) and "Send follow-ups" (Buyers) open a preview with who, message, channel and step, using the brief's dummy wording.
- "Send" marks each message "Sent (demo)". No email, SMS or WhatsApp provider is connected at all.

**6.9 Commissions and finance ledger**
- **Commissions (Must):**
  - Admin table by agent: branch, sales, money received, earned, paid out and due. Filters for development, branch and month.
  - Agent view: earned to date and this month, by buyer.
- **Finance ledger (Should):**
  - One line per payment, with totals.
  - CSV laid out for QuickBooks, Sage or Xero.
  - A fake "Accounting connection" panel.
  - No double-entry port.

**6.10 Viewings and show days (Must, new)**
- **Viewing form:** for phones. Enquiry (or a new one with name and phone), date, stands, Hot/Warm/Cold, offer yes or no with amount, and notes. Saving moves the stage to Viewing or Offer.
- **Show days:** Admin creates one. Agents use quick capture (name, phone, interest, offer). Each visitor becomes an enquiry with a follow-up for the next day, and the duplicate rules in section 5 apply. Under 30 seconds per visitor.
- **Summary:** visitors by agent, interest levels, offers and follow-ups created.

**6.11 Reports (Must)**
- Six indexed SQL queries: payment progress (≥ 50% filter), overdue (worst first), payments coming in (30/60/90 days), sales performance, lead sources (enquiries and sales), and stand stock.
- Filters for development, branch, agent and dates. Agents see their own figures.
- Export to Excel (SynCRM's `xlsx` code) and PDF (`report-export.ts`).

**6.12 Import (Should)**
- A trimmed wizard: upload, map, preview, import, summary.
- Enquiries: a matching phone (in international format) **updates** the existing enquiry. New ones land at New enquiry.
- Stands: imported from a spreadsheet.

**6.13 The public website (Must, new)**
- **Page:** `/site/<slug>` with the header, intro and photo, "N stands available", the grid for the website phase (about 60 stands), a colour key and a footer.
- **Privacy:** the public API returns only number, size, stage, price and status, never names or overdue flags.
- **Panel:** a bottom sheet on phones and a modal on desktop, with validated name, Zimbabwe phone number and email.

```
POST /api/public/interest
 ├── same phone as an existing enquiry or buyer → add the stand of interest (section 5 rules)
 ├── otherwise → new enquiry at New, source Website, agent from the round robin
 ├── stand reserved meanwhile → still saved, and the brief's "just been reserved" message shown
 └── bell notification for the agent AND all Admins; agent Today item; version goes up
```

**6.14 Dummy data and reset (Must)**
- `seed.ts` uses a fixed random seed with dates relative to today in Harare time. It loads:
  - **Developments:** the main one with 400 stands across serviced and foundation stages, with about 60 on the website phase. A second development with 30 stands.
  - **Stand status:** about 50% available, 15% reserved for named enquiries, 35% sold.
  - **People:** 3 branches and 9 agents. The demo agent is "Rudo" in Branch A.
  - **Enquiries:** about 100 across every stage and source, with **activity history**, follow-ups (some due today) and a few stale ones (7+ days).
  - **Buyers:** about 40, each with a won enquiry and a source. Plans of 12 and 24 months. 4 overdue by 7, 14, 30 and 45 days (2 of them Rudo's). A few fully paid. About 350 payments.
  - **Commissions:** some commission payouts, so "paid out" and "due" both have numbers.
  - **Show day and viewings:** a show day **dated today** with Rudo attending, plus past viewings.
  - **Messages and notifications:** some already marked "Sent (demo)", and some unread notifications.
  - **Meeting setup:** the half-finished enquiry belongs to **Rudo** (offer made, no stand). `nextAgentIndex` is set so **the first website enquiry after a reset goes to Rudo**.
- **"Reset demo"** (Admin, with confirmation) runs the about-15-statement batch from section 3.5. It must finish in under a minute and is timed on the deployed copy.

## 7. Walkthrough script (brief section 8, with who does what)

| Step | Device and role | What must be true |
|---|---|---|
| 1. Website | Phone, no login | Rudo gets the enquiry (round robin); stand stays light green |
| 2. New enquiry | Laptop, Admin | The bell shows it; enquiry has source Website, the stand attached, and agent Rudo |
| 3. Dashboard | Laptop, Admin | Stand and money cards and the branch table |
| 4. Stand map | Laptop, Admin | Filter, search, open stand, change price (existing sales keep their price) |
| 5. Agent on a phone | Phone, logged in as Rudo (or Admin switched to "View as Rudo") | Only Rudo's buyers; record a visitor on today's show day |
| 6. Reserve | Phone, Rudo, using the half-finished enquiry | Amber within about 4 seconds on the laptop map; amber on the website after refresh |
| 7. Sale and payment | Sale by Rudo on the phone. **Receive payment on the laptop as Admin** (agents can't take payments) | Dark green with the name; reminder preview; an overdue buyer's red dot |
| 8. Commissions | Phone, Rudo | Commission from the payment just received |
| 9. Reports | Laptop, Admin | ≥ 50% paid, overdue, statement PDF, ledger line for the payment |

## 8. Testing

- **Unit tests (Vitest):**
  - plan maths (the brief's example)
  - payment allocation and commission
  - the role table
  - website intake: new, duplicate phone, buyer phone, stand reserved meanwhile
  - two people reserving the same stand at once
  - round robin
  - score decay
  - seed counts and the meeting setup
  - the brand guard
- **End to end** against `wrangler dev` with a local D1, then on the deployed copy, following the section 7 script.
- **Phones:** a real Android and an iPhone on mobile data, under 3 seconds per screen.
- **Two clean timed runs from a fresh reset**, then the backup video. No changes in the last 24 hours.

## 9. Order of work (about 11 working days)

| Day | Work | Done when |
|---|---|---|
| 1–2 | Repo; static export plus Hono Worker; D1 (weur) and Drizzle; deploy to the neutral address; the Convex-style API and hooks; login and sessions; measure PBKDF2 CPU | Logged in on a phone through the deployed Worker |
| 3 | Schema; seed and reset; branding; shell; access scoping; Admin/Agent switch; settings | Reset under a minute on the deployed copy; brand guard passes |
| 4 | Developments, stand map, stand details, reserve and release, prices, live updates | Reserve on the laptop and the phone shows amber within about 4 seconds |
| 5–6 | Sale, plan, buyers, buyer page, receive payment, cancel, statement PDF, dashboard (with stage, branch and Today) | Steps 3, 4 and 7 work |
| 7 | Enquiries list and board, enquiry page, actions, follow-ups, stale flag, score | Step 6 works from the half-finished enquiry |
| 8 | Website and intake, round robin, bell; viewing form; show days and summary; search | Steps 1, 2 and 5 work on a phone |
| 9 | Commissions, reminders preview, 6 reports with Excel and PDF, ledger and CSV, accounting panel; **switch to Workers Paid** | Steps 8 and 9 work |
| 10 | Import; phone and speed pass; brand sweep; fixes; first timed run | Every "Done when" item except the second run |
| 11 | Second timed run, fixes, backup video, **freeze** (no changes in the last 24 hours) | Every box ticked |

**To fit 9 days, cut in this order:**
1. Import
2. The ledger and accounting panel
3. Polish on four of the reports (keep "≥ 50% paid" and "Overdue" polished)
4. The show-day summary
5. Excel (keep CSV)
6. Commission filters

## 10. Risks

| Risk | What we do |
|---|---|
| The team has not agreed to leave Sync Estate (decision 1) | Settle it before day 1 |
| D1 daily write limit or 10 ms CPU on Free during rehearsals | Switch to Paid ($5) on day 9; reset uses about 15 statements |
| Two people grab the same stand, or the round robin clashes | Guarded updates and `RETURNING`; tested |
| Polling lag in the meeting | Refetch straight after every change; 4-second poll; Durable Object push as the upgrade |
| Porting UI is slower than expected | The Convex-style hooks keep names and shapes; trim screens to the brief |
| Brand leaks (address bar, tab title, PDF, file names, errors) | Neutral domain; build-time brand; brand guard on `out/` and PDFs; manual sweep on day 10 |
| A cached old build in the meeting | No service worker or manifest |
| Meeting-room internet | Backup video; phones tested on mobile data |
| Official logo still missing | Use the image shared on 19 Nov; swap in Des's file when it arrives |

## 11. Still open

1. Meeting date.
2. Does the team agree to a separate Cloudflare app instead of a Sync Estate demo organisation?
3. Workers Paid ($5) for the rehearsal and meeting month: approved?
4. The web address: buy a neutral domain, or create a new Cloudflare account with a neutral subdomain?
5. Development and branch names (placeholders: "Borrowdale Park", "Branch A/B/C"), and the demo agent's name.
6. The official logo file from Des.
7. Should we ask Chas Everitt for a sample stand list?
