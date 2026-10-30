import { describe, it, expect } from "vitest";
import {
  LEGACY_DEFAULT_MODULES,
  MODULE_HOME_HREFS,
  emailAlertChoices,
  landingHref,
  orgModules,
  userCanUseModule,
  userModules,
} from "../../convex/lib/modules";
import { MODULES, MODULE_ORDER, moduleForPath } from "../config/modules";

const allOn = { enabledModules: ["media", "worth", "stay", "crm"] as const };

describe("orgModules", () => {
  it("gives orgs that predate the Hub the CRM and SyncMedia only", () => {
    expect(orgModules({})).toEqual([...LEGACY_DEFAULT_MODULES]);
    expect(orgModules(null)).toEqual(["crm", "media"]);
  });

  it("returns enabled modules in registry order", () => {
    expect(orgModules(allOn)).toEqual(["crm", "stay", "worth", "media"]);
  });
});

describe("userCanUseModule", () => {
  it("lets an admin open every enabled module and nothing else", () => {
    const admin = { role: "admin" as const };
    expect(userModules(admin, allOn)).toEqual(["crm", "stay", "worth", "media"]);
    expect(userCanUseModule(admin, {}, "stay")).toBe(false);
  });

  it("keeps CRM and SyncMedia open to every agent", () => {
    const agent = { role: "agent" as const };
    expect(userModules(agent, allOn)).toEqual(["crm", "media"]);
  });

  it("opens Sync Stay to property managers and accounts", () => {
    expect(userCanUseModule({ role: "agent", estateRoles: ["property_manager"] }, allOn, "stay")).toBe(true);
    expect(userCanUseModule({ role: "agent", estateRoles: ["accounts"] }, allOn, "stay")).toBe(true);
    expect(userCanUseModule({ role: "agent", estateRoles: ["valuer"] }, allOn, "stay")).toBe(false);
  });

  it("opens Sync Worth to valuation roles and accounts", () => {
    for (const r of ["valuer", "signing_valuer", "valuations_admin", "accounts"] as const) {
      expect(userCanUseModule({ role: "agent", estateRoles: [r] }, allOn, "worth")).toBe(true);
    }
    expect(userCanUseModule({ role: "agent", estateRoles: ["property_manager"] }, allOn, "worth")).toBe(false);
  });

  it("never opens a module the org has switched off, whatever the role", () => {
    const pm = { role: "agent" as const, estateRoles: ["property_manager"] as const };
    expect(userCanUseModule(pm, { enabledModules: ["crm"] }, "stay")).toBe(false);
  });
});

describe("moduleForPath", () => {
  it("maps module routes to their module", () => {
    expect(moduleForPath("/app/stay")).toBe("stay");
    expect(moduleForPath("/app/stay/leases/abc")).toBe("stay");
    expect(moduleForPath("/app/worth/jobs")).toBe("worth");
    expect(moduleForPath("/app/syncmedia/new")).toBe("media");
    expect(moduleForPath("/app/admin/branding")).toBe("media");
  });

  it("treats Hub routes as the Hub and anything else as the CRM", () => {
    expect(moduleForPath("/app/hub")).toBe("hub");
    expect(moduleForPath("/app/admin/users")).toBe("hub");
    expect(moduleForPath("/app/leads/123")).toBe("crm");
    expect(moduleForPath("/app/admin/stages")).toBe("crm");
    expect(moduleForPath("/app/staying")).toBe("crm");
  });
});

describe("landingHref", () => {
  const everything = { enabledModules: ["crm", "stay", "worth", "finance", "dev", "media"] as const };

  it("lands directors on the Hub", () => {
    expect(landingHref({ role: "admin" }, everything)).toBe("/app/hub");
  });

  it("lands a sales agent or sales manager in the CRM", () => {
    expect(landingHref({ role: "agent" }, everything)).toBe("/app/dashboard");
    expect(landingHref({ role: "agent", estateRoles: ["sales_manager"] }, everything)).toBe("/app/dashboard");
  });

  it("lands a single-role user in that role's module", () => {
    expect(landingHref({ role: "agent", estateRoles: ["property_manager"] }, everything)).toBe("/app/stay");
    expect(landingHref({ role: "agent", estateRoles: ["accounts"] }, everything)).toBe("/app/finance");
    expect(landingHref({ role: "agent", estateRoles: ["marketing"] }, everything)).toBe("/app/syncmedia");
    expect(landingHref({ role: "agent", estateRoles: ["valuer", "signing_valuer"] }, everything)).toBe("/app/worth");
  });

  it("lands someone whose roles span modules on the Hub", () => {
    expect(landingHref({ role: "agent", estateRoles: ["property_manager", "sales_manager"] }, everything)).toBe("/app/hub");
  });

  it("ignores roles for modules the agency has switched off", () => {
    const crmOnly = { enabledModules: ["crm", "media"] as const };
    expect(landingHref({ role: "agent", estateRoles: ["property_manager"] }, crmOnly)).toBe("/app/dashboard");
  });

  it("keeps the server home routes in step with the front-end registry", () => {
    for (const k of MODULE_ORDER) expect(MODULE_HOME_HREFS[k]).toBe(MODULES[k].homeHref);
  });
});

describe("emailAlertChoices", () => {
  it("offers the Hub plus the modules the user can open", () => {
    expect(emailAlertChoices({ role: "agent" }, allOn)).toEqual(["hub", "crm", "media"]);
    expect(emailAlertChoices({ role: "agent", estateRoles: ["property_manager"] }, allOn)).toEqual(["hub", "crm", "stay", "media"]);
  });
});
