# Platform administration (LayerSync staff)

SynCRM is multi-tenant. Client organisations are isolated from one another and
every org-scoped Convex function resolves the organisation from the signed-in
user's `orgId`. **Platform admins** are LayerSync staff accounts that sit
*above* organisations: they have no `orgId`, never show up in a client's user
list, and can open any organisation in a read-only view.

This is a per-deployment feature. SynCRM (`syncrm`) and each white-label
deployment (e.g. Property Shop) have their own Convex deployment, so the steps
below are repeated for each one you need access to.

## How it works

| Piece | Where |
|-------|-------|
| `users.isPlatformAdmin`, `users.platformViewOrgId`, `organizations.deletingAt` | `convex/schema.ts` |
| Read-only seam: a platform admin with `platformViewOrgId` is treated as an admin of that org for **queries**; any **mutation** that reaches `getCurrentUserWithOrg` throws `Platform view is read-only` | `convex/helpers.ts` |
| Organisation list, open/exit view, grant/revoke admins, purge | `convex/platform.ts` (+ pure helpers in `convex/platformLib.ts`) |
| Platform page, yellow banner, sidebar entry, redirect for org-less platform admins | `src/app/app/platform/page.tsx`, `src/components/layout/platform-view-banner.tsx`, `src/app/app/layout.tsx` |

Platform admins' own-row preferences (timezone, view mode, push subscriptions)
still work in view mode; uploads and file deletes are refused.

## 1. Create the first platform admin (CLI)

Run against the deployment you want access to (`--prod` for production; omit
it for the dev deployment):

```bash
npx convex run platform:grantPlatformAdminCli '{"email":"ops@layersync.ai","fullName":"LayerSync Ops"}' --prod
```

The result includes `tempPasswordHint` for a newly created account: a random
password generated for that account only. Sign in with it; you are forced to
set a new password, then land on **Platform**.

Rules:

- The email must not belong to a user inside an organisation. Platform admins
  are separate accounts (use a work address that is not a member anywhere).
- Re-running the command on an existing platform admin is a no-op
  (`alreadyAdmin: true`).
- Further admins can be granted from the Platform page ("Platform admins" card),
  or with the same command.

## 2. Onboarding a new organisation

Platform → **New organisation** opens a five-step wizard (the first step also picks the plan)
(`/app/platform/organizations/new`). Nothing is saved or uploaded until
**Create organisation** on the last step.

1. **Organisation**: name, web address (slug, checked live), currency, optional
   agency email/phone, and a *demo organisation* switch.
2. **Modules**: which of CRM, SyncStay, SyncWorth, SyncFinance, SyncDev and
   SyncMedia the agency can use.
3. **Branding**: logo, optional logo for dark backgrounds, primary colour,
   optional (dark) sidebar colour, and **White label** (see below). A live
   preview shows what their people will see.
4. **Owner**: full name, email (their sign-in) and a temporary password
   (pre-generated; type your own if you prefer). Tick *Email these login
   details* to send them through Resend.
5. **Review**: then create.

The done screen shows the sign-in link, email and temporary password with a
**Copy login details** button. **Open organisation** opens it in the usual
read-only view, in its own colours if it is white-labelled.

What gets created, in one transaction (`onboarding.createOrganization`):

- the organisation, with its modules, flags and `onboardedBy`;
- its brand kit row (`orgBranding`), shared with SyncMedia brochures and PDFs;
- the owner: an **admin** with `resetPasswordOnNextLogin` and the onboarding
  tour on;
- the defaults every agency starts with (`convex/lib/orgDefaults.ts`):
  pipeline stages, curated areas, commission scenarios and, with SyncFinance,
  its settings and categories;
- `org.create` and `user.create` entries in the agency's own Logs page.

The owner signs in on the normal sign-in page, must choose a new password,
then lands on the Hub with only their modules.

**Demo organisations.** **New demo org** opens the same wizard pre-filled: demo
on, every module, white label on, owner `admin@<slug>.demo` with a generated
password and no email. Demo orgs carry a **Demo** badge (filter with
*Customers / Demos*) and are deleted like any other (section 4).

**Edit.** The **Edit** button on a row (`/app/platform/organizations/<id>`)
changes the name, currency and demo flag, turns white label on or off
(live for everyone in the org), replaces logos and colours, switches
modules, and issues any of the org's admins a new temporary password.

### Plans (pilot)

Every organisation has one plan (`organizations.plan`, rules in `convex/lib/plans.ts`):

| Plan | What it means |
|------|---------------|
| Free trial | Runs until `trialEndsAt`. Add days from the organisation's page (+7 / +14 / +30, or pick an end date). |
| Beta tester | Helping test during the pilot, no end date. |
| Standard | Paid, SyncEstate look. |
| White label | Paid, the agency's own logo and colours. |

Paid plans decide the look (White label on, Standard off); trial and beta
organisations can be shown either way. Organisations set up before plans show
"No plan set" until one is picked. When a trial is in its last 7 days or has
ended, the agency's admins see a reminder bar with LayerSync's contact email;
nothing is locked. Every plan change and extension is written to the
organisation's Logs page (`org.plan_change`).

### White label

White label is per organisation (`organizations.whiteLabel`, set only here).
When on, the agency's logo, primary colour, sidebar colour and name replace
the SyncEstate look in the app once its people sign in: sidebar logo (or
initials), Hub name, page title, tour and colours (`branding.getAppTheme` →
`OrgBrandProvider` → `--brand-*` overrides). When off, the app looks exactly
like SyncEstate; the logo and colour are still used for brochures and PDFs.

Not covered yet: the sign-in page (it can't know the org before sign-in),
emails, the PWA icon/favicon, the tenant portal, the mobile app, chart
colours on report pages, and module names (SyncStay etc.).

## 3. Opening an organisation (read-only)

Platform → **Open** on a row. You are redirected to that organisation's
dashboard with a yellow *Platform view* banner. Everything renders as an admin
of that organisation sees it; every write returns "Platform view is read-only".
The client's Admin → Logs page shows a `platform.view_org` entry so the access is
transparent. **Exit organisation** returns you to the overview.

## 4. Deleting an organisation

Platform → trash icon on the row → type the organisation **slug** → **Delete
organisation**. The purge runs in the background in batches of 200 documents
(`platform.purgeOrganizationBatch`), re-scheduling itself until nothing is
left, then deletes the organisation row and writes an `org.purged` audit entry
with the total count. The row shows **Deleting…** while it runs and disappears
when done.

What is removed: every table carrying the organisation's `orgId` (leads,
contacts, properties, activities, documents and their files, viewing forms and
signatures, branding logos, brochures, commission data, stages, locations,
logs, …), every user in the organisation together with their auth accounts,
sessions, refresh tokens, verification codes, password-reset tokens,
reminders, rate-limit rows, push subscriptions and copilot chats.

Not removed: property image files that are referenced only by URL (the rows
hold no storage id), and legacy rows with no `orgId`.

CLI alternative:

```bash
npx convex run platform:purgeOrganizationBySlug '{"slug":"tagiv","confirm":"DELETE tagiv"}' --prod
```

Users of the organisation are deactivated in the first batch, so nobody can
keep writing while rows disappear. The purge is idempotent and safe to re-run.

### Runbook: Matrix Realty and Tagiv

1. Deploy this version to the production Convex deployment.
2. `npx convex run platform:grantPlatformAdminCli '{"email":"<you>","fullName":"<name>"}' --prod`
3. Sign in, set your password, open **Platform**.
4. Delete **Matrix Realty** (type its slug), then **Tagiv**.
5. Confirm both rows disappear and an `org.purged` entry appears in the Convex
   dashboard logs with the document counts.

## Website enquiries

The Platform page lists everyone who pressed **Get in touch** on the SyncEstate landing page or
on layersyncai.com (`convex/websiteEnquiries.ts`). Each visitor left a name and phone number and
was then sent on to WhatsApp, so most will already be in the LayerSync chat. One row per phone
number: a repeat enquiry updates the row and marks it **New** again. Mark rows **Contacted** or
**Archive** them as you work through them.

- The landing page saves with the public `websiteEnquiries.submit` mutation.
- layersyncai.com posts JSON (as `text/plain`) to `https://<deployment>.convex.site/website-enquiry`.
- A site-wide rate limit (30 a minute) stops floods; bad names or numbers are rejected.

