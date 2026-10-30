// The website's SyncEstate palette (src/app/globals.css and src/config/brand.ts),
// so the app reads as the same product. Light only for now, like the site.
//
// Charcoal does the work and green marks what is active or good. The logo
// green is too light to read as text, so text, icons and active tabs use
// `brand`, a dark green ink; `primary` is the light green for fills, always
// with charcoal (`onPrimary`) on top.

export const colors = {
  primary: "#9bd83d",
  primaryDark: "#86c42e",
  primaryLight: "#edf7dc",
  onPrimary: "#0f1419",
  // Green ink: links, active tabs, selected chips and accent icons.
  brand: "#3b6812",
  brandDark: "#2c4f0d",
  brandLight: "#edf7dc",
  // Charcoal: dark surfaces such as the sign-in screen and the current tab.
  ink: "#0f1419",
  background: "#f2f4f3",
  card: "#ffffff",
  surface: "#f6f7f7",
  text: "#0f1419",
  muted: "#58626a",
  faint: "#77818a",
  border: "#e3e7e8",
  borderStrong: "#d2d8da",
  success: "#3b6812",
  successBg: "#edf7dc",
  warning: "#8a5300",
  warningBg: "#fff2d9",
  danger: "#d92d20",
  dangerBg: "#fde8e8",
  info: "#1f5fad",
  infoBg: "#e3f1ff",
  // Lead temperature, as on the website.
  hot: "#b2361a",
  hotBg: "#ffe9e2",
  warm: "#8a5300",
  warmBg: "#fff2d9",
  cold: "#1f5fad",
  coldBg: "#e3f1ff",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 };

export const font = { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 28 };
