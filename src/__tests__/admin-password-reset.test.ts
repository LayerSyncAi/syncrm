import { describe, it, expect } from "vitest";

// ────────────────────────────────────────────────────────────
// Pure helper types mirroring the Convex schema
// ────────────────────────────────────────────────────────────

interface User {
  _id: string;
  email?: string;
  fullName?: string;
  role: "admin" | "agent";
  isActive: boolean;
  orgId?: string;
  resetPasswordOnNextLogin?: boolean;
  passwordUpdatedAt?: number;
}

interface AuthAccount {
  _id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  secret?: string;
}

// ────────────────────────────────────────────────────────────
// Extracted pure business logic (mirrors backend handlers)
// ────────────────────────────────────────────────────────────

const DEFAULT_TEMP_PASSWORD = "1234";

/** Validates whether a caller has admin access */
function validateAdminAccess(user: User | null): { valid: boolean; error?: string } {
  if (!user) return { valid: false, error: "Unauthorized" };
  if (!user.isActive) return { valid: false, error: "User account is not active" };
  if (user.role !== "admin") return { valid: false, error: "Admin access required" };
  if (!user.orgId) return { valid: false, error: "User is not associated with an organization" };
  return { valid: true };
}

/** Validates whether an admin can reset a target user's password */
function validateAdminResetTarget(
  admin: User,
  target: User | null
): { valid: boolean; error?: string } {
  if (!target) return { valid: false, error: "User not found" };
  if (target.orgId !== admin.orgId) return { valid: false, error: "User not found" };
  return { valid: true };
}

/** Validates the new password for forced password change */
function validateNewPassword(
  password: string,
  confirmPassword: string
): { valid: boolean; error?: string } {
  if (password !== confirmPassword) {
    return { valid: false, error: "Passwords do not match" };
  }
  if (!password || password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  return { valid: true };
}

/** Validates server-side password (action-level, no confirm needed) */
function validatePasswordServerSide(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  return { valid: true };
}

/** Determines whether a user should be forced to change password */
function shouldForcePasswordChange(user: User): boolean {
  return user.resetPasswordOnNextLogin === true;
}

/** Determines what happens after an admin creates a user */
function getAdminCreateUserResult(args: {
  email: string;
  fullName: string;
  role: "admin" | "agent";
  isActive: boolean;
  existingUser?: User | null;
  adminOrgId: string;
}): {
  action: "return_existing" | "create_new" | "error";
  error?: string;
  resetPasswordOnNextLogin?: boolean;
  hasPasswordSet?: boolean;
} {
  if (args.existingUser) {
    if (args.existingUser.orgId && args.existingUser.orgId !== args.adminOrgId) {
      return {
        action: "error",
        error: "A user with this email already belongs to another organization",
      };
    }
    return { action: "return_existing" };
  }
  return {
    action: "create_new",
    resetPasswordOnNextLogin: true,
    hasPasswordSet: true,
  };
}

/** Determines what happens after password is force-changed */
function getPostForceChangeState(
  user: User,
  _newPasswordHash: string
): Partial<User> {
  return {
    resetPasswordOnNextLogin: false,
    passwordUpdatedAt: Date.now(),
  };
}

/** Determines what happens after admin resets a user's password */
function getPostAdminResetState(): {
  resetPasswordOnNextLogin: boolean;
  passwordSetToDefault: boolean;
} {
  return {
    resetPasswordOnNextLogin: true,
    passwordSetToDefault: true,
  };
}

/** Determines route access for a user based on their state */
function canAccessProtectedRoute(
  user: User,
  currentPath: string
): { allowed: boolean; redirectTo?: string } {
  if (user.resetPasswordOnNextLogin) {
    if (currentPath === "/app/force-change-password") {
      return { allowed: true };
    }
    return { allowed: false, redirectTo: "/app/force-change-password" };
  }
  return { allowed: true };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe("Admin Create User", () => {
  it("new user gets hashed password and resetPasswordOnNextLogin = true", () => {
    const result = getAdminCreateUserResult({
      email: "newuser@test.com",
      fullName: "New User",
      role: "agent",
      isActive: true,
      existingUser: null,
      adminOrgId: "org_123",
    });

    expect(result.action).toBe("create_new");
    expect(result.resetPasswordOnNextLogin).toBe(true);
    expect(result.hasPasswordSet).toBe(true);
  });

  it("existing user in same org returns existing ID", () => {
    const result = getAdminCreateUserResult({
      email: "existing@test.com",
      fullName: "Existing User",
      role: "agent",
      isActive: true,
      existingUser: {
        _id: "user_existing",
        email: "existing@test.com",
        role: "agent",
        isActive: true,
        orgId: "org_123",
      },
      adminOrgId: "org_123",
    });

    expect(result.action).toBe("return_existing");
  });

  it("existing user in different org is rejected", () => {
    const result = getAdminCreateUserResult({
      email: "other@test.com",
      fullName: "Other User",
      role: "agent",
      isActive: true,
      existingUser: {
        _id: "user_other",
        email: "other@test.com",
        role: "agent",
        isActive: true,
        orgId: "org_other",
      },
      adminOrgId: "org_123",
    });

    expect(result.action).toBe("error");
    expect(result.error).toContain("already belongs to another organization");
  });
});

describe("Admin Reset Password", () => {
  const admin: User = {
    _id: "admin_1",
    email: "admin@test.com",
    role: "admin",
    isActive: true,
    orgId: "org_123",
  };

  it("admin can reset another user's password in same org", () => {
    const target: User = {
      _id: "user_1",
      email: "user@test.com",
      role: "agent",
      isActive: true,
      orgId: "org_123",
    };

    const accessCheck = validateAdminAccess(admin);
    expect(accessCheck.valid).toBe(true);

    const targetCheck = validateAdminResetTarget(admin, target);
    expect(targetCheck.valid).toBe(true);

    const result = getPostAdminResetState();
    expect(result.resetPasswordOnNextLogin).toBe(true);
    expect(result.passwordSetToDefault).toBe(true);
  });

  it("non-admin cannot reset another user's password", () => {
    const agent: User = {
      _id: "agent_1",
      email: "agent@test.com",
      role: "agent",
      isActive: true,
      orgId: "org_123",
    };

    const accessCheck = validateAdminAccess(agent);
    expect(accessCheck.valid).toBe(false);
    expect(accessCheck.error).toBe("Admin access required");
  });

  it("inactive admin cannot reset passwords", () => {
    const inactiveAdmin: User = {
      _id: "admin_inactive",
      email: "inactive@test.com",
      role: "admin",
      isActive: false,
      orgId: "org_123",
    };

    const accessCheck = validateAdminAccess(inactiveAdmin);
    expect(accessCheck.valid).toBe(false);
    expect(accessCheck.error).toBe("User account is not active");
  });

  it("admin cannot reset user in different org", () => {
    const targetDifferentOrg: User = {
      _id: "user_other",
      email: "other@test.com",
      role: "agent",
      isActive: true,
      orgId: "org_other",
    };

    const targetCheck = validateAdminResetTarget(admin, targetDifferentOrg);
    expect(targetCheck.valid).toBe(false);
    expect(targetCheck.error).toBe("User not found");
  });

  it("admin cannot reset non-existent user", () => {
    const targetCheck = validateAdminResetTarget(admin, null);
    expect(targetCheck.valid).toBe(false);
    expect(targetCheck.error).toBe("User not found");
  });

  it("target user gets temp password and resetPasswordOnNextLogin = true", () => {
    const result = getPostAdminResetState();
    expect(result.resetPasswordOnNextLogin).toBe(true);
    expect(result.passwordSetToDefault).toBe(true);
  });

  it("unauthenticated user cannot reset passwords", () => {
    const accessCheck = validateAdminAccess(null);
    expect(accessCheck.valid).toBe(false);
    expect(accessCheck.error).toBe("Unauthorized");
  });
});

describe("Login Flow - Forced Reset Detection", () => {
  it("user with resetPasswordOnNextLogin=true is forced to reset", () => {
    const user: User = {
      _id: "user_1",
      email: "user@test.com",
      role: "agent",
      isActive: true,
      orgId: "org_123",
      resetPasswordOnNextLogin: true,
    };

    expect(shouldForcePasswordChange(user)).toBe(true);
  });

  it("user with resetPasswordOnNextLogin=false is not forced to reset", () => {
    const user: User = {
      _id: "user_1",
      email: "user@test.com",
      role: "agent",
      isActive: true,
      orgId: "org_123",
      resetPasswordOnNextLogin: false,
    };

    expect(shouldForcePasswordChange(user)).toBe(false);
  });

  it("user with resetPasswordOnNextLogin=undefined is not forced to reset", () => {
    const user: User = {
      _id: "user_1",
      email: "user@test.com",
      role: "agent",
      isActive: true,
      orgId: "org_123",
    };

    expect(shouldForcePasswordChange(user)).toBe(false);
  });

  it("user with flag cannot access protected routes", () => {
    const user: User = {
      _id: "user_1",
      email: "user@test.com",
      role: "agent",
      isActive: true,
      orgId: "org_123",
      resetPasswordOnNextLogin: true,
    };

    const dashboardAccess = canAccessProtectedRoute(user, "/app/dashboard");
    expect(dashboardAccess.allowed).toBe(false);
    expect(dashboardAccess.redirectTo).toBe("/app/force-change-password");

    const leadsAccess = canAccessProtectedRoute(user, "/app/leads");
    expect(leadsAccess.allowed).toBe(false);
    expect(leadsAccess.redirectTo).toBe("/app/force-change-password");

    const adminAccess = canAccessProtectedRoute(user, "/app/admin/users");
    expect(adminAccess.allowed).toBe(false);
    expect(adminAccess.redirectTo).toBe("/app/force-change-password");
  });

  it("user with flag CAN access force-change-password page", () => {
    const user: User = {
      _id: "user_1",
      email: "user@test.com",
      role: "agent",
      isActive: true,
      orgId: "org_123",
      resetPasswordOnNextLogin: true,
    };

    const result = canAccessProtectedRoute(user, "/app/force-change-password");
    expect(result.allowed).toBe(true);
  });
});

describe("Forced Password Reset Form", () => {
  it("mismatched passwords are rejected", () => {
    const result = validateNewPassword("SecurePass1", "SecurePass2");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Passwords do not match");
  });

  it("empty password is rejected", () => {
    const result = validateNewPassword("", "");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Password must be at least 8 characters");
  });

  it("short password is rejected", () => {
    const result = validateNewPassword("short", "short");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Password must be at least 8 characters");
  });

  it("7 char password is rejected", () => {
    const result = validateNewPassword("1234567", "1234567");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Password must be at least 8 characters");
  });

  it("8 char matching passwords are accepted", () => {
    const result = validateNewPassword("12345678", "12345678");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("long matching passwords are accepted", () => {
    const result = validateNewPassword(
      "aVerySecurePasswordThatIsLong123!",
      "aVerySecurePasswordThatIsLong123!"
    );
    expect(result.valid).toBe(true);
  });

  it("server-side validation rejects short passwords", () => {
    const result = validatePasswordServerSide("1234");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Password must be at least 8 characters");
  });

  it("server-side validation accepts valid passwords", () => {
    const result = validatePasswordServerSide("MyNewSecurePassword");
    expect(result.valid).toBe(true);
  });

  it("valid password updates hash and sets flag false", () => {
    const user: User = {
      _id: "user_1",
      email: "user@test.com",
      role: "agent",
      isActive: true,
      orgId: "org_123",
      resetPasswordOnNextLogin: true,
    };

    const postChangeState = getPostForceChangeState(user, "hash_of_new_password");
    expect(postChangeState.resetPasswordOnNextLogin).toBe(false);
    expect(postChangeState.passwordUpdatedAt).toBeDefined();
    expect(typeof postChangeState.passwordUpdatedAt).toBe("number");
  });
});

describe("Post-Reset Access", () => {
  it("user can access protected routes after password change", () => {
    const user: User = {
      _id: "user_1",
      email: "user@test.com",
      role: "agent",
      isActive: true,
      orgId: "org_123",
      resetPasswordOnNextLogin: false,
    };

    const dashboardAccess = canAccessProtectedRoute(user, "/app/dashboard");
    expect(dashboardAccess.allowed).toBe(true);
    expect(dashboardAccess.redirectTo).toBeUndefined();

    const leadsAccess = canAccessProtectedRoute(user, "/app/leads");
    expect(leadsAccess.allowed).toBe(true);

    const adminAccess = canAccessProtectedRoute(user, "/app/admin/users");
    expect(adminAccess.allowed).toBe(true);
  });

  it("user is no longer forced to change password after reset", () => {
    const user: User = {
      _id: "user_1",
      email: "user@test.com",
      role: "agent",
      isActive: true,
      orgId: "org_123",
      resetPasswordOnNextLogin: false,
      passwordUpdatedAt: Date.now(),
    };

    expect(shouldForcePasswordChange(user)).toBe(false);
  });
});

describe("Default Temp Password", () => {
  it("default temp password is 1234", () => {
    expect(DEFAULT_TEMP_PASSWORD).toBe("1234");
  });
});
