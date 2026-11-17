/**
 * Validation for the platform onboarding wizard. Pure, so the wizard checks
 * each step with exactly the rules the server enforces on create.
 */
import { MODULE_KEYS, type ModuleKey } from "./modules";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_SLUG_LENGTH = 50;

export type OnboardingField =
  | "name"
  | "slug"
  | "modules"
  | "primaryColor"
  | "sidebarColor"
  | "ownerFullName"
  | "ownerEmail"
  | "password";

export interface OnboardingInput {
  name: string;
  slug: string;
  modules: readonly string[];
  primaryColor?: string;
  sidebarColor?: string;
  ownerFullName: string;
  ownerEmail: string;
  /** Empty means "generate one for me". */
  password: string;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Lowercase letters and digits in dash-separated words, as generateSlug makes. */
export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= MAX_SLUG_LENGTH && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/**
 * The sidebar's text and icons are light, so its colour must be dark enough
 * for them to stay readable (light text #eef2f3 at 4.5:1 or better).
 */
export function isDarkEnoughForSidebar(hex: string): boolean {
  if (!isHexColor(hex)) return false;
  return (relativeLuminance("#eef2f3") + 0.05) / (relativeLuminance(hex) + 0.05) >= 4.5;
}

export const SIDEBAR_TOO_LIGHT = "Pick a darker sidebar colour so the menu text stays readable";

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

/** The sign-in suggested for a demo organisation's owner. */
export function demoOwnerEmail(slug: string): string {
  return `admin@${slug || "demo"}.demo`;
}

/** Field → message for everything wrong with the input (empty when valid). */
export function onboardingErrors(input: OnboardingInput): Partial<Record<OnboardingField, string>> {
  const errors: Partial<Record<OnboardingField, string>> = {};
  if (!input.name.trim()) errors.name = "Enter the organisation's name";
  if (!isValidSlug(input.slug)) {
    errors.slug = "Use 2–50 lowercase letters, numbers and single dashes";
  }
  if (input.modules.length === 0) errors.modules = "Pick at least one module";
  else if (!input.modules.every(isModuleKey)) errors.modules = "Unknown module";
  if (input.primaryColor && !isHexColor(input.primaryColor)) {
    errors.primaryColor = "Use a hex colour such as #1f5fad";
  }
  if (input.sidebarColor && !isHexColor(input.sidebarColor)) {
    errors.sidebarColor = "Use a hex colour such as #0f1419";
  } else if (input.sidebarColor && !isDarkEnoughForSidebar(input.sidebarColor)) {
    errors.sidebarColor = SIDEBAR_TOO_LIGHT;
  }
  if (!input.ownerFullName.trim()) errors.ownerFullName = "Enter the owner's name";
  if (!isValidEmail(input.ownerEmail)) errors.ownerEmail = "Enter a valid email address";
  if (input.password && input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return errors;
}
