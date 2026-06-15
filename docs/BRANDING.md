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
to the SynCRM default**, so an unconfigured deploy is identical to today.

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

| Variable | Description | Example (SynCRM default) |
|---|---|---|
| `NEXT_PUBLIC_BRAND_NAME` | Product name in UI, titles, copy | `SynCRM` |
| `NEXT_PUBLIC_BRAND_LEGAL_NAME` | Legal entity for footer/legal | `SynCRM` |
| `NEXT_PUBLIC_BRAND_TAGLINE` | One-line tagline | `The CRM built for real estate teams` |
| `NEXT_PUBLIC_BRAND_DESCRIPTION` | Meta description | `Real Estate Pipeline CRM` |
| `NEXT_PUBLIC_BRAND_APP_DOMAIN` | App domain shown on the marketing mock | `app.syncrm.com` |
| `NEXT_PUBLIC_BRAND_CONTACT_EMAIL` | Contact email (optional) | _(empty)_ |
| `NEXT_PUBLIC_BRAND_CONTACT_PHONE` | Contact phone (optional) | _(empty)_ |
| `NEXT_PUBLIC_BRAND_CONTACT_ADDRESS` | Contact address (optional) | _(empty)_ |
| `NEXT_PUBLIC_BRAND_COLOR_PRIMARY` | Accent colour | `#eca400` |
| `NEXT_PUBLIC_BRAND_COLOR_PRIMARY_600` | Accent, darker (hover) | `#d89500` |
| `NEXT_PUBLIC_BRAND_COLOR_PRIMARY_FG` | Text on the accent | `#ffffff` |
| `NEXT_PUBLIC_BRAND_COLOR_SIDEBAR` | Sidebar surface | `#2a5925` |
| `NEXT_PUBLIC_BRAND_COLOR_SIDEBAR_HOVER` | Sidebar hover/active | `#1e3f1a` |
| `NEXT_PUBLIC_BRAND_COLOR_SIDEBAR_FG` | Sidebar text | `#fcfcfc` |
| `NEXT_PUBLIC_BRAND_COLOR_BACKGROUND` | App content background | `#f1f4f9` |
| `NEXT_PUBLIC_BRAND_COLOR_FOREGROUND` | Primary text/ink | `#1f2a44` |
| `NEXT_PUBLIC_BRAND_COLOR_SUCCESS` | Success semantic | `#16a34a` |
| `NEXT_PUBLIC_BRAND_COLOR_WARNING` | Warning semantic | `#ca8a04` |
| `NEXT_PUBLIC_BRAND_COLOR_DANGER` | Danger semantic | `#dc2626` |
| `NEXT_PUBLIC_BRAND_COLOR_INFO` | Info semantic | `#0284c7` |
| `NEXT_PUBLIC_BRAND_LOGO_FAVICON` | Favicon (32×32 png) | `/brand/favicon-32x32.png` |
| `NEXT_PUBLIC_BRAND_LOGO_ICON` | App icon (192×192 png) | `/brand/icon-192x192.png` |
| `NEXT_PUBLIC_BRAND_LOGO_APPLE` | Apple touch icon | `/brand/apple-touch-icon.png` |
| `NEXT_PUBLIC_BRAND_LOGO_WORDMARK` | Image wordmark | `/brand/wordmark.png` |
| `NEXT_PUBLIC_BRAND_LOGO_OG` | Social share image | `/brand/og.png` |

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
- **Forks: protect your logos.** Run once so upstream merges keep your assets:
  ```bash
  git config merge.ours.driver true
  ```
  (Enabled by the `public/brand/** merge=ours` rule in `.gitattributes`.)
