import { describe, it, expect } from "vitest";
import {
  demoOwnerEmail,
  isDarkEnoughForSidebar,
  isValidEmail,
  isValidSlug,
  onboardingErrors,
  type OnboardingInput,
} from "../../convex/lib/onboardingRules";
import { generateSlug } from "../../convex/platformLib";
import { MODULE_KEYS } from "../../convex/lib/modules";
import {
  PRIMARY_SUGGESTIONS,
  SIDEBAR_SUGGESTIONS,
  generatePassword,
} from "../components/platform/onboarding/shared";

const valid: OnboardingInput = {
  name: "Chas Everett",
  slug: "chas-everett",
  modules: ["crm", "stay"],
  primaryColor: "#1f5fad",
  sidebarColor: "#0b2545",
  ownerFullName: "Tendai Moyo",
  ownerEmail: "tendai@chaseverett.co.zw",
  password: "Temp-pass-123",
};

describe("onboardingErrors", () => {
  it("accepts a complete organisation", () => {
    expect(onboardingErrors(valid)).toEqual({});
  });

  it("accepts an empty password (the server generates one) and no colours", () => {
    expect(onboardingErrors({ ...valid, password: "", primaryColor: undefined, sidebarColor: undefined })).toEqual({});
  });

  it.each<[Partial<OnboardingInput>, keyof ReturnType<typeof onboardingErrors>]>([
    [{ name: "   " }, "name"],
    [{ slug: "Chas Everett" }, "slug"],
    [{ slug: "chas--everett" }, "slug"],
    [{ slug: "-chas" }, "slug"],
    [{ slug: "c" }, "slug"],
    [{ modules: [] }, "modules"],
    [{ modules: ["crm", "payroll"] }, "modules"],
    [{ primaryColor: "blue" }, "primaryColor"],
    [{ sidebarColor: "#fff" }, "sidebarColor"],
    [{ sidebarColor: "#f2f4f3" }, "sidebarColor"],
    [{ ownerFullName: "" }, "ownerFullName"],
    [{ ownerEmail: "tendai@" }, "ownerEmail"],
    [{ password: "short" }, "password"],
  ])("rejects %o as a bad %s", (patch, field) => {
    const errors = onboardingErrors({ ...valid, ...patch });
    expect(Object.keys(errors)).toEqual([field]);
  });
});

describe("slugs", () => {
  it.each(["Chas Everett", "Pam Golding Properties (Harare)", "Seeff  —  Borrowdale", "A1 Realty"])(
    "generateSlug(%s) is a valid slug",
    (name) => {
      expect(isValidSlug(generateSlug(name))).toBe(true);
    }
  );
});

describe("demo owner email", () => {
  it("is a valid sign-in address", () => {
    expect(demoOwnerEmail("chas-everett")).toBe("admin@chas-everett.demo");
    expect(isValidEmail(demoOwnerEmail("chas-everett"))).toBe(true);
    expect(isValidEmail(demoOwnerEmail(""))).toBe(true);
  });
});

describe("wizard defaults", () => {
  it("only suggests sidebar colours the light menu text can sit on", () => {
    for (const hex of SIDEBAR_SUGGESTIONS) expect(isDarkEnoughForSidebar(hex)).toBe(true);
  });

  it("suggests valid primary colours", () => {
    for (const hex of PRIMARY_SUGGESTIONS) {
      expect(onboardingErrors({ ...valid, primaryColor: hex }).primaryColor).toBeUndefined();
    }
  });

  it("generates temporary passwords that pass validation and avoid look-alike characters", () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword();
      expect(pw).toHaveLength(12);
      expect(pw).not.toMatch(/[0O1lI]/);
      expect(onboardingErrors({ ...valid, password: pw }).password).toBeUndefined();
    }
  });

  it("knows every module", () => {
    expect(onboardingErrors({ ...valid, modules: [...MODULE_KEYS] })).toEqual({});
  });
});
