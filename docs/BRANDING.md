# White-label / Branding

Every client-specific value lives in **one place** so the app can be rebranded
with environment variables and a few asset files — no code edits.

## Single source of truth

| Concern | Where |
|---|---|
| Names, tagline, colours, logo paths, metadata | **`src/config/brand.ts`** (typed `BrandConfig`) |
| Per-client values (overrides) | **`.env.local`** (and the host's env vars) |
| Logo / icon / OG image files | **`public/brand/`** |

`brand.ts` reads each value from a `NEXT_PUBLIC_BRAND_*` env var and **falls back
to the SyncEstate default**, so an unconfigured deploy shows the SyncEstate brand.

How colours flow into the UI:

```
.env.local ─▶ src/config/brand.ts ─▶ brandThemeCss() ─▶ <style> in layout.tsx
           ─▶ :root { --brand-* }   ─▶ globals.css  --primary: var(--brand-primary, …)
           ─▶ Tailwind utilities (bg-primary, text-sidebar-fg, …)
```

Components keep using their normal utility classes (`bg-primary`,
`bg-sidebar-bg`, `text-sidebar-fg`); only the *value behind the token* changes.
`--row-hover` and `--primary-glow` are derived from `--primary` with `color-mix`,
so a rebrand usually only needs the one primary colour.

## Rebrand a client in 3 steps

1. **Set env vars.** Copy the `NEXT_PUBLIC_BRAND_*` block from `.env.example` into
   `.env.local` for local dev, **and** add the same vars to the Vercel project's
   *Settings → Environment Variables* (Production + Preview).
2. **Drop in logo files.** Replace the files in `public/brand/` with the client's,
   keeping the same filenames (or point the `NEXT_PUBLIC_BRAND_LOGO_*` vars at any
   other `/public` path):
   - `favicon-32x32.png`, `icon-192x192.png`, `apple-touch-icon.png`
   - `wordmark.png` (image wordmark, if you use one instead of the text name)
   - `og.png` (social-share preview, ~1200×630)
3. **Redeploy.** `NEXT_PUBLIC_*` values are inlined at **build time**, so colour
   and name changes only take effect on a fresh build.

## Environment variables

| Variable | Description | Example (SyncEstate default) |
|---|---|---|
| `NEXT_PUBLIC_BRAND_NAME` | Product name in UI, titles, copy | `SyncEstate` |
| `NEXT_PUBLIC_BRAND_LEGAL_NAME` | Legal entity for footer/legal | `LayerSync` |
| `NEXT_PUBLIC_BRAND_TAGLINE` | One-line tagline | `Smarter real estate. Together.` |
| `NEXT_PUBLIC_BRAND_DESCRIPTION` | Meta description | `Leads, lettings, valuations and finance for estate agencies, on one login` |
| `NEXT_PUBLIC_BRAND_APP_DOMAIN` | App domain shown on the marketing mock | `app.syncrm.com` |
| `NEXT_PUBLIC_BRAND_CONTACT_EMAIL` | Contact email (optional) | _(empty)_ |
| `NEXT_PUBLIC_BRAND_CONTACT_PHONE` | Contact phone (optional) | _(empty)_ |
| `NEXT_PUBLIC_BRAND_CONTACT_ADDRESS` | Contact address (optional) | _(empty)_ |
| `NEXT_PUBLIC_BRAND_COLOR_PRIMARY` | Accent colour | `#9bd83d` |
| `NEXT_PUBLIC_BRAND_COLOR_PRIMARY_600` | Accent, darker (hover) | `#86c42e` |
| `NEXT_PUBLIC_BRAND_COLOR_PRIMARY_FG` | Text on the accent | `#0f1419` |
| `NEXT_PUBLIC_BRAND_COLOR_PRIMARY_INK` | Accent for text on light surfaces (links, active labels). Leave unset to mix one from the accent | `#3b6812` |
| `NEXT_PUBLIC_BRAND_COLOR_SIDEBAR` | Sidebar surface | `#0f1419` |
| `NEXT_PUBLIC_BRAND_COLOR_SIDEBAR_HOVER` | Sidebar hover/active | `#1a2229` |
| `NEXT_PUBLIC_BRAND_COLOR_SIDEBAR_FG` | Sidebar text | `#eef2f3` |
| `NEXT_PUBLIC_BRAND_COLOR_BACKGROUND` | App content background | `#f2f4f3` |
| `NEXT_PUBLIC_BRAND_COLOR_FOREGROUND` | Primary text/ink | `#0f1419` |
| `NEXT_PUBLIC_BRAND_COLOR_SUCCESS` | Success semantic | `#3b6812` |
| `NEXT_PUBLIC_BRAND_COLOR_WARNING` | Warning semantic | `#b45309` |
| `NEXT_PUBLIC_BRAND_COLOR_DANGER` | Danger semantic | `#d92d20` |
| `NEXT_PUBLIC_BRAND_COLOR_INFO` | Info semantic | `#1f5fad` |
| `NEXT_PUBLIC_BRAND_LOGO_FAVICON` | Favicon (32×32 png) | `/brand/favicon-32x32.png` |
| `NEXT_PUBLIC_BRAND_LOGO_ICON` | App icon (192×192 png) | `/brand/icon-192x192.png` |
| `NEXT_PUBLIC_BRAND_LOGO_APPLE` | Apple touch icon | `/brand/apple-touch-icon.png` |
| `NEXT_PUBLIC_BRAND_LOGO_WORDMARK` | Image wordmark | `/brand/wordmark.png` |
| `NEXT_PUBLIC_BRAND_LOGO_OG` | Social share image | `/brand/og.png` |
| `NEXT_PUBLIC_BRAND_LOGO_REVERSED` | Logo for the dark sidebar | `/brand/lockup-reversed.svg` |
| `NEXT_PUBLIC_BRAND_LOGO_APP_ICON` | Square icon for the collapsed sidebar | `/brand/app-icon-dark.svg` |

## Notes & limits

- **Colours are build-time.** Because they ship via `NEXT_PUBLIC_*`, changing a
  colour or name requires a **redeploy** — they are not runtime-switchable.
- **The design system stays put.** Neutral surfaces (`--bg`, `--card-bg`,
  `--surface-2`) and the soft status-pill tints (`--status-*`) live in
  `globals.css` and are intentionally **not** per-client; they're the product's
  visual system, not brand identity.
- **PWA manifest is separate.** `public/manifest.json` is a static file (the
  install name/colours and the `/icons/*` set). To fully rebrand the installed
  PWA, edit `manifest.json` and replace `public/icons/*` directly.
- **App favicon convention.** Next also auto-serves `src/app/favicon.ico`. Swap
  that file to change the browser-tab icon for the `/` route.
- **Copilot/AI name** is intentionally left as "SynCRM" (the in-app assistant),
  not parameterised.
- **Accent text.** A light accent (such as the SyncEstate green) is unreadable
  as text on white, so links and active labels use `--primary-ink`, a darker
  shade of the accent. Fills keep the accent itself with `PRIMARY_FG` text.
- **Regenerating icons.** `npm run generate-icons` rebuilds every PNG icon
  (PWA, favicon, wordmark, share image) from the SVGs in `public/brand`.
- **Forks: protect your logos.** Run once so upstream merges keep your assets:
  ```bash
  git config merge.ours.driver true
  ```
  (Enabled by the `public/brand/** merge=ours` rule in `.gitattributes`.)
