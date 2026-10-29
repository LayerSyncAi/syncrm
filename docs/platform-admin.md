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

## 2. Opening an organisation (read-only)

Platform → **Open** on a row. You are redirected to that organisation's
dashboard with a yellow *Platform view* banner. Everything renders as an admin
of that organisation sees it; every write returns "Platform view is read-only".
The client's Admin → Logs page shows a `platform.view_org` entry so the access is
transparent. **Exit organisation** returns you to the overview.

## 3. Deleting an organisation

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
