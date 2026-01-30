"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useAuth() {
  const { signIn, signOut } = useAuthActions();
  const user = useQuery(api.users.getMe);

  const isLoading = user === undefined;
  const isAuthenticated = user !== null && user !== undefined;

  return {
    user,
    isLoading,
    isAuthenticated,
    signIn,
    signOut,
  };
}

export function useRequireAuth() {
  const { user, isLoading, isAuthenticated, signIn, signOut } = useAuth();

  return {
    user,
    isLoading,
    isAuthenticated,
    signIn,
    signOut,
    isAdmin: user?.role === "admin",
  };
}
