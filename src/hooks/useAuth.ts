"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery, useConvexAuth } from "convex/react";
import { useRef, useEffect } from "react";
import { api } from "../../convex/_generated/api";

export function useAuth() {
  const { signIn, signOut } = useAuthActions();
  // Use useConvexAuth for reliable auth state - this properly tracks
  // the session token state and avoids race conditions after login/signup
  const { isLoading: isAuthLoading, isAuthenticated: isSessionAuthenticated } = useConvexAuth();

  // Only query user data if we have an authenticated session
  // Skip the query entirely while auth is loading or when not authenticated
  const user = useQuery(
    api.users.getMe,
    isAuthLoading || !isSessionAuthenticated ? "skip" : undefined
  );

  // Combined loading state: auth session loading OR user data loading
  const isUserLoading = isSessionAuthenticated && user === undefined;
  const isLoading = isAuthLoading || isUserLoading;

  // User is authenticated if session is authenticated AND user data is loaded
  // This ensures we have both the session token and the user record
  const isAuthenticated = isSessionAuthenticated && user !== null && user !== undefined;

  // Track previous state for change detection in debug logging
  const prevState = useRef({ isAuthLoading, isSessionAuthenticated, user, isLoading, isAuthenticated });

  // Debug logging - only log when state changes
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      const prev = prevState.current;
      const stateChanged =
        prev.isAuthLoading !== isAuthLoading ||
        prev.isSessionAuthenticated !== isSessionAuthenticated ||
        prev.user !== user ||
        prev.isLoading !== isLoading ||
        prev.isAuthenticated !== isAuthenticated;

      if (stateChanged) {
        console.log("[useAuth] State changed:", {
          isAuthLoading,
          isSessionAuthenticated,
          userQueryResult: user === undefined ? "loading" : user === null ? "null" : "user",
          userEmail: user?.email || null,
          isUserLoading,
          isLoading,
          isAuthenticated,
        });
        prevState.current = { isAuthLoading, isSessionAuthenticated, user, isLoading, isAuthenticated };
      }
    }
  }, [isAuthLoading, isSessionAuthenticated, user, isLoading, isAuthenticated, isUserLoading]);

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
