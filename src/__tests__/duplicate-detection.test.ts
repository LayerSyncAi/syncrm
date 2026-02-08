import { describe, it, expect } from "vitest";
import { normalizePhone, normalizeEmail } from "../lib/csv";

describe("normalizePhone", () => {
  it("strips spaces and dashes", () => {
    expect(normalizePhone("077 123 4567")).toBe("0771234567");
    expect(normalizePhone("077-123-4567")).toBe("0771234567");
  });

  it("keeps leading + when present", () => {
    expect(normalizePhone("+263 77 123 4567")).toBe("+263771234567");
    expect(normalizePhone("+ 1 555 123 4567")).toBe("+15551234567");
  });

  it("strips parentheses and dots", () => {
    expect(normalizePhone("(555) 123.4567")).toBe("5551234567");
  });

  it("handles already-clean numbers", () => {
    expect(normalizePhone("0771234567")).toBe("0771234567");
    expect(normalizePhone("+263771234567")).toBe("+263771234567");
  });

  it("handles empty string", () => {
    expect(normalizePhone("")).toBe("");
  });

  it("two different formatted versions of the same number match", () => {
    const a = normalizePhone("+263 77 123 4567");
    const b = normalizePhone("+263-77-123-4567");
    expect(a).toBe(b);
  });
});

describe("normalizeEmail", () => {
  it("trims whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("converts to lowercase", () => {
    expect(normalizeEmail("User@Example.COM")).toBe("user@example.com");
  });

  it("handles already-normalized email", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });

  it("trims and lowercases combined", () => {
    expect(normalizeEmail("  John.Doe@Gmail.COM ")).toBe("john.doe@gmail.com");
  });

  it("two different formatted versions of the same email match", () => {
    const a = normalizeEmail("  User@Example.Com");
    const b = normalizeEmail("user@example.com ");
    expect(a).toBe(b);
  });
});

describe("duplicate detection logic", () => {
  const existingLeads = [
    {
      _id: "lead1",
      fullName: "John Doe",
      phone: "+263 77 123 4567",
      email: "john@example.com",
      isArchived: false,
    },
    {
      _id: "lead2",
      fullName: "Jane Smith",
      phone: "077-999-8888",
      email: "jane@test.org",
      isArchived: false,
    },
    {
      _id: "lead3",
      fullName: "Archived Lead",
      phone: "077-111-2222",
      email: "archived@test.com",
      isArchived: true,
    },
  ];

  function findDuplicate(email?: string, phone?: string, excludeId?: string) {
    const activeLeads = existingLeads.filter(
      (l) => !l.isArchived && l._id !== excludeId
    );

    for (const lead of activeLeads) {
      if (email && lead.email) {
        if (normalizeEmail(lead.email) === normalizeEmail(email)) {
          return { leadId: lead._id, reason: "Email match" };
        }
      }
      if (phone) {
        if (normalizePhone(lead.phone) === normalizePhone(phone)) {
          return { leadId: lead._id, reason: "Phone match" };
        }
      }
    }
    return null;
  }

  it("detects email duplicate", () => {
    const result = findDuplicate("  John@Example.COM  ");
    expect(result).not.toBeNull();
    expect(result!.leadId).toBe("lead1");
    expect(result!.reason).toBe("Email match");
  });

  it("detects phone duplicate", () => {
    const result = findDuplicate(undefined, "+263771234567");
    expect(result).not.toBeNull();
    expect(result!.leadId).toBe("lead1");
    expect(result!.reason).toBe("Phone match");
  });

  it("does not match archived leads", () => {
    const result = findDuplicate("archived@test.com", "0771112222");
    expect(result).toBeNull();
  });

  it("excludes specified lead ID", () => {
    const result = findDuplicate("john@example.com", undefined, "lead1");
    expect(result).toBeNull();
  });

  it("returns null when no duplicate found", () => {
    const result = findDuplicate("unique@example.com", "9999999999");
    expect(result).toBeNull();
  });

  it("email match takes priority over phone match", () => {
    const result = findDuplicate("john@example.com", "077-999-8888");
    expect(result).not.toBeNull();
    expect(result!.leadId).toBe("lead1");
    expect(result!.reason).toBe("Email match");
  });
});
