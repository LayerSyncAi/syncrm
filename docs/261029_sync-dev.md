# Sync Dev

Build notes for the team. Sync Dev is the developments module: every stand in every development, reserving and selling, and buyers paying on plans.

## What it does

- **Developments:** name, location, who holds the money (the developer, or the agency in trust for a developer), currency, and optional commission and interest.
- **Stand inventory:** add stands in one go (`1-40, A1-A12`), each available, reserved or sold. Any agent can reserve a stand for a client on the spot; a reservation with a date lapses by itself.
- **Selling:** pick the stand, type the buyer, accept the default plan (10% deposit, 12 monthly instalments). The buyer becomes a Hub contact (matched by phone or email first).
- **Buyers:** paid to date, balance, overdue and next due for every sale; statements by email with the PDF attached; reminders before and after due dates through Sync Notify; optional monthly interest on overdue amounts.
- **Roles:** every agent sees availability and can reserve. Directors, sales managers and accounts price, sell, take payments, cancel and refund. Directors and accounts reverse payments.

## Working with or without other modules

Modules are sold separately, so each works on its own:

| Agency has | Payments | Inventory |
|---|---|---|
| Sync Dev only | Recorded by Sync Dev (`devPayments`) with the agency's receipt numbers | Full |
| Sync Dev and Finance | Ledger receipts: trust, commission, developer payouts | Full |
| Finance only | Ledger receipts, under Finance's Instalments | Kept in step in the background, not shown |

Screens name what another module would add, and link to it only when the agency has it.

If an agency adds Sync Finance later, **Finance, Import and migrate, Bring in Sync Dev payments** (`finance/posting:bringInDevPayments`) posts the payments Sync Dev recorded, with their original receipt numbers. Payments on a cancelled sale come in without commission. It is safe to run again.

## Data

- Developments (`finDevelopments`) and sales on plans (`finStands`) are shared with Finance; the `fin` prefix is historical. The code lives in `convex/dev/sales.ts`.
- `devStands`: the inventory. A sale points at its stand (`finStands.devStandId`) and the stand at its live sale (`devStands.saleId`). Every way of creating a sale (Sync Dev, Finance's Instalments, the Excel import) marks the stand sold, adding it to the inventory if needed. Cancelling a sale puts the stand back on the market.
- `devPayments`: payments and refunds taken without Finance. `finTxId` is set once brought into Finance, so they are never counted twice.
- Schema changes are additive. Sales made before Sync Dev existed (in Finance's Instalments or by import) need their inventory stand once: run `npx convex run dev/migrations:linkInventory` after deploying, repeating until `isDone`. It is safe to run again.

## Switching it on

Platform screen, open the agency, tick Sync Dev (or `npx convex run hub:setOrgModulesCli '{"slug":"<org>","modules":[...,"dev"]}'`).

## Verification

- Unit tests: `src/__tests__/dev-inventory.test.ts` (stand number ranges, ordering, lapsed reservations, access).
- End to end against a local backend, through the real functions: 28 checks across Dev only, Dev plus Finance and Finance only, including roles, cancel and refund, bringing payments into Finance without double counting, and the inventory staying in step. Finance's own 48 checks still pass.
- Website, signed in, in a headless browser: a director sells a stand with three fields in about a second and takes a payment on the statement; an agent with no roles can reserve but not sell.
- Mobile app (Expo web build on a phone-sized screen): an agent reserves on site; a sales manager sells and takes a payment. Not yet run on a physical phone.
- The link migration gives an older sale its inventory stand, and a second run changes nothing.
