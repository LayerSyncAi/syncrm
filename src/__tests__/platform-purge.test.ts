import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PURGE_TABLE_ORDER,
  isStorageRef,
  rateLimitKeysForUser,
  purgeConfirmPhrase,
} from "../../convex/platformLib";

/**
 * Tables in convex/schema.ts and the module schema files it spreads in
 * (convex/schemas/*.ts) whose definition carries an `orgId` field.
 */
function orgScopedTablesFromSchema(): string[] {
  const convexDir = join(__dirname, "../../convex");
  const schemaDir = join(convexDir, "schemas");
  const schema = [
    readFileSync(join(convexDir, "schema.ts"), "utf8"),
    ...readdirSync(schemaDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => readFileSync(join(schemaDir, f), "utf8")),
  ].join("\n");
  const tables: string[] = [];
  const re = /^\s{2}(\w+): defineTable\(\{/gm;
  const starts: Array<{ name: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema)) !== null) {
    starts.push({ name: m[1], index: m.index });
  }
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : schema.length;
    const body = schema.slice(start.index, end);
    if (/^\s+orgId: v\./m.test(body)) tables.push(start.name);
  });
  return tables;
}

describe("PURGE_TABLE_ORDER", () => {
  it("covers every org-scoped table in the schema and nothing else", () => {
    const fromSchema = orgScopedTablesFromSchema();
    expect(fromSchema.length).toBeGreaterThan(20);
    expect([...PURGE_TABLE_ORDER].sort()).toEqual([...fromSchema].sort());
  });

  it("deletes users last so user-keyed rows stay reachable", () => {
    expect(PURGE_TABLE_ORDER[PURGE_TABLE_ORDER.length - 1]).toBe("users");
  });

  it("deletes child rows before their parents", () => {
    const pos = (t: string) => PURGE_TABLE_ORDER.indexOf(t as (typeof PURGE_TABLE_ORDER)[number]);
    expect(pos("leadPropertyMatches")).toBeLessThan(pos("leads"));
    expect(pos("activities")).toBeLessThan(pos("leads"));
    expect(pos("leads")).toBeLessThan(pos("contacts"));
    expect(pos("propertyCollaborators")).toBeLessThan(pos("properties"));
    expect(pos("propertyOwners")).toBeLessThan(pos("contacts"));
  });
});

describe("isStorageRef", () => {
  it("treats URLs and site-relative paths as external", () => {
    expect(isStorageRef("https://cdn.example.com/a.png")).toBe(false);
    expect(isStorageRef("http://x/y")).toBe(false);
    expect(isStorageRef("/brand/logo.png")).toBe(false);
    expect(isStorageRef(undefined)).toBe(false);
    expect(isStorageRef("")).toBe(false);
  });

  it("treats anything else as a storage id", () => {
    expect(isStorageRef("kg2abc123xyz")).toBe(true);
  });
});

describe("helpers", () => {
  it("builds rate-limit keys per action", () => {
    expect(rateLimitKeysForUser("u1", ["leadCreate", "importBulk"])).toEqual([
      "leadCreate:u1",
      "importBulk:u1",
    ]);
  });

  it("requires the slug in the confirmation phrase", () => {
    expect(purgeConfirmPhrase("tagiv")).toBe("DELETE tagiv");
  });
});
