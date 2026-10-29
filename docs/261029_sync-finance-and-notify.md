# Sync Finance v1 and Sync Notify

Build notes for the team. Source: LayerSync BRD "Sync Finance v1" (16 October 2026).

## How the money model works

One small double-entry ledger that users never see.

- `finTransactions`: one event (receipt, payment, transfer, opening balance).
- `finLines`: its postings. A line either moves money in a bank or cash account (`accountId`) or says whose money it is (`ledger` + `key`): a landlord, a tenant deposit, a sale, a developer, the agency, or "unallocated".
- Per transaction and currency, account lines and ledger lines sum to the same figure (`checkPosting` in `convex/finance/lib.ts`). Every balance, statement and report is a sum of lines, so they always agree.
- Nothing is deleted. A reversal is a new transaction with the lines negated, dated today, so closed months never change.
- USD and ZiG are never mixed or converted.

All money goes through `postTransaction` in `convex/finance/core.ts`. It checks the posting balances, the date is in an open month, and no client ledger goes below zero (FN-24).

| Event | Account lines | Ledger lines |
|---|---|---|
| Rent receipt (Sync Stay) | trust or cash float + | landlord + (lease admin fees: agency +) |
| Commission moved | trust -, business + | landlord -, agency + |
| Landlord payout | trust - | landlord - |
| Repair paid for a landlord | trust - | landlord - |
| Agency expense | business or cash - | agency - (category) |
| Stand payment, agency holds money | trust + | developer + |
| Stand payment, developer is our client | business + | agency + (Stand sales) |
| Opening balance, trust account | trust + | unallocated + |
| Opening balance, landlord | none | landlord +, unallocated - |

## Integration with Sync Stay

When Finance is switched on, Sync Stay posts automatically (`convex/finance/posting.ts`):

- `payments.record` calls `postStayPayment`; `payments.reverse` calls `reverseStayPayment`; `deposits.settle` calls `postDepositSettlement`.
- Receipt numbers share Stay's counter: one sequence per agency (FN-12).
- Commission rate: the lease's own rate (`stayLeases.managementFeePct`, new optional field) or the property's.
- When Finance is on, landlord statements come from Finance; the Stay statements page links there.

## Migrating an agency onto Finance

Finance menu, "Import and migrate" (directors only). Every import is a batch that can be undone in one action.

1. Set up accounts and settings (Finance settings).
2. Import opening balances at go-live: each bank account, each landlord, each tenant deposit. Trust balances start unallocated; landlord and deposit balances are taken from it. Whatever stays unallocated is trust money nobody has been matched to yet.
3. Optionally import historical receipts and payments (a year of the receipt book), keeping their original numbers.
4. Import clients already on instalment plans with what they have paid so far.
5. "Bring in Sync Stay receipts" posts Stay receipts recorded before go-live. It is safe to run again.

Do not import tenant deposits as opening balances if the Sync Stay Excel import already brought them in while Finance was on.

Schema changes are additive and optional, so no data migration is needed for existing orgs. Switch Finance on per agency from the Platform screen or `npx convex run hub:setOrgModulesCli '{"slug":"<org>","modules":["crm","stay","worth","finance","media"]}'`.

## Sync Notify

Hub-level communications (`convex/notify/`, `/app/notify`).

- Each agency chooses email and SMS, and a preferred channel, once.
- Modules only trigger: `queueMessage(ctx, orgId, {...})` with `channel: "preferred"` lets the agency's setting decide. Instalment reminders already go this way.
- Bulk sends pick recipients from captured data (contacts, staff, clients on instalments, unpaid invoices, tenants in arrears) or an imported list, with `{placeholders}` and a preview.
- The log shows every Sync Notify message and the emails modules send themselves, with sent, logged, queued or failed.

Environment: `RESEND_API_KEY` and `EMAIL_FROM` for email. SMS uses the agency's own Twilio account if saved in Sync Notify settings, else `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM`. Without keys, messages are only logged ("logged" status).

An agency's own Twilio account is stored encrypted (AES-256-GCM, `convex/lib/secretBox.ts`) with `NOTIFY_SECRET_KEY`, 32 random bytes in base64 set on each deployment:
`npx convex env set NOTIFY_SECRET_KEY "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"`.
Without the key, agencies use the deployment's Twilio account and the screen says why. Losing the key means agencies re-enter their SMS details.

## Verification status

Checked on 29 October 2026:

- Type-check, lint, unit tests (`src/__tests__/finance-ledger.test.ts`, 301 in the suite) and `next build` pass.
- Pushed to the local Convex backend (needs Node 22 or 24; the project has "use node" actions). Schema and functions accepted; real codegen matches the committed `convex/_generated` files.
- 39 end-to-end checks against that backend through the real public functions, signed in as a director and an accounts clerk: Stay receipt posts with the same number, commission moves, trust and cash book balances, overdraw blocked, two-approver payout, remittance figures, Stay reversal unwinds Finance, landlord statement, dashboard, invoice paid, instalments allocated oldest first with interest once a month, developer report, cancel and refund, Sync Notify routing to SMS with placeholders filled, SMS token never returned, opening import and undo, historical import keeps numbers, closed month rejected, Hub figures, agent statement.
- Every Finance screen, Sync Notify, My commission and the changed Stay screens were opened in a headless browser while signed in, with no runtime or server errors. Screenshots checked by eye.
- The test agency was removed with the platform purge, which also confirmed the purge covers every new table.
- Second run, with a director, an accounts clerk, a property manager and a sales agent (BRD section 4): a property rate changed in Sync Stay overrides the landlord rate, and a lease rate overrides both; Stay's daily job emails the tenant a rent invoice before the due date; the Sync Dev contract creates a stand, shows a payment back and keeps it when the plan changes; the SMS account is stored encrypted and decrypts with the deployment key; the clerk cannot reverse or close months; the property manager sees only their landlord and no agency money; the agent has no Finance but sees their own commission. The same roles were checked in the web app.
- A server-generated invoice PDF was opened and checked: A4, branded, totals correct.
- The real mobile screens (Expo, web build) ran on a phone-sized screen against the local backend: sign-in, Finance dashboard and a cash receipt recorded in under a second. As a property manager the app shows only their landlord and no agency money; as a sales agent Finance is locked. Not yet run on a physical phone.
- Moving a Stay deposit between trust, business and the landlord moves it in Finance: checked in all four directions.

## Documents, rates and mobile

- Every Finance document emailed (receipt, invoice, remittance advice, landlord statement, instalment statement) carries the branded PDF as an attachment, drawn on the server by `convex/finance/pdfMail.ts` with the same layout the app downloads. If the PDF fails the email still goes, without it, and the error is logged.
- Commission (FN-30): a landlord rate applies to all their properties; a property can then differ (Sync Stay) and a lease can have its own rate. At receipt time the lease's rate wins, then the property's.
- The mobile app has Sync Finance: dashboard, money in with receipt, cash-up, landlords and statements, instalments with receive payment, and payout approval. Money out, transfers, reversals, invoices, commissions, settings and imports stay on the website.

## Sync Dev

Sync Dev is a separate product. The Finance BRD's stand requirements (FN-90 to FN-97) are built in Finance, and Finance's side of the section 7 integration is in `convex/finance/devSync.ts`:

- Dev to Finance: `syncDevelopment` and `syncStand` (developments, stands, buyers, price, payment plan, who holds the money).
- Finance to Dev: `standStatus` (paid to date, balance, overdue, next due and every payment).

Until Sync Dev ships, the Instalments screens write the same tables.

## Limits to know

- Reports read every line in the range they are asked for. The auditor pack and the accounting export fetch a month at a time, so a year never comes back in one read.
- Account balances come from per-month totals (`finAccountMonths`), kept on every posting. If they ever drift (for example after restoring data), `npx convex run finance/migrations:rebuildAccountMonths '{"orgId":"..."}'` rebuilds them from the entries; repeat with the returned cursor until `isDone`.
