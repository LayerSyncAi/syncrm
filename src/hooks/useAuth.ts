"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery, useConvexAuth } from "convex/react";
import { useRef, useEffect, useState, useCallback } from "react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

// Grace period (ms) to wait before treating a session loss as a real logout.
// This covers the window where the Convex WebSocket reconnects and refreshes
// the token after the app returns from the background (e.g. mobile app switch).
const AUTH_GRACE_PERIOD_MS = 5000;

/**
 * Returns a stabilised version of isSessionAuthenticated that doesn't
 * immediately flip to false when the underlying auth state drops out
 * briefly (e.g. WebSocket reconnecting after mobile app switch).
 *
 * - When auth goes from true → false, we start a grace-period timer.
 *   If auth recovers within the window we never report false.
 * - If the document is hidden (user switched away), we freeze the auth
 *   state until the user comes back, then start the grace period.
 */
function useStableSessionAuth() {
  const { isLoading: isAuthLoading, isAuthenticated: rawIsSessionAuthenticated } = useConvexAuth();

  // The "stable" value we expose — only flips to false after the grace period.
  const [stableAuth, setStableAuth] = useState(rawIsSessionAuthenticated);

  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we were previously authenticated (to detect transitions).
  const wasAuthenticated = useRef(rawIsSessionAuthenticated);
  // Track document visibility so we can freeze auth state while hidden.
  const isDocumentHidden = useRef(typeof document !== "undefined" && document.hidden);

  const clearGraceTimer = useCallback(() => {
    if (graceTimer.current) {
      clearTimeout(graceTimer.current);
      graceTimer.current = null;
    }
  }, []);

  // Respond to raw auth changes with grace-period logic.
  useEffect(() => {
    if (isAuthLoading) return;

    if (rawIsSessionAuthenticated) {
      // Auth recovered (or was always true) — clear any pending logout.
      clearGraceTimer();
      setStableAuth(true);
      wasAuthenticated.current = true;
      return;
    }

    // rawIsSessionAuthenticated is false from here.
    if (!wasAuthenticated.current) {
      // User was never authenticated in this session — pass through immediately.
      setStableAuth(false);
      return;
    }

    // Auth dropped while we were previously authenticated.
    // If the document is hidden we defer entirely until visibility changes.
    if (isDocumentHidden.current) return;

    // Start grace period if not already running.
    if (!graceTimer.current) {
      graceTimer.current = setTimeout(() => {
        graceTimer.current = null;
        // After the grace period, if still unauthenticated, commit the logout.
        setStableAuth(false);
        wasAuthenticated.current = false;
      }, AUTH_GRACE_PERIOD_MS);
    }
  }, [isAuthLoading, rawIsSessionAuthenticated, clearGraceTimer]);

  // Handle visibility changes: when the user returns, give the token a
  // chance to refresh before we evaluate auth state.
  useEffect(() => {
    if (typeof document === "undefined") return;

    const onVisibilityChange = () => {
      isDocumentHidden.current = document.hidden;

      if (!document.hidden && wasAuthenticated.current) {
        // App returned to foreground. If auth is currently false, start
        // the grace timer to give the WebSocket time to reconnect.
        clearGraceTimer();
        if (!rawIsSessionAuthenticated) {
          graceTimer.current = setTimeout(() => {
            graceTimer.current = null;
            // Grace period expired after returning to foreground.
            // Commit the logout — the main effect will also handle this
            // if rawIsSessionAuthenticated is still false on re-render.
            setStableAuth(false);
            wasAuthenticated.current = false;
          }, AUTH_GRACE_PERIOD_MS);
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearGraceTimer();
    };
  }, [rawIsSessionAuthenticated, clearGraceTimer]);

  // Clean up on unmount.
  useEffect(() => clearGraceTimer, [clearGraceTimer]);

  return {
    isAuthLoading,
    isSessionAuthenticated: stableAuth,
    // Expose raw value for debug logging.
    rawIsSessionAuthenticated,
  };
}

export function useAuth() {
  const { signIn, signOut } = useAuthActions();
  const {
    isAuthLoading,
    isSessionAuthenticated,
    rawIsSessionAuthenticated,
  } = useStableSessionAuth();

  // Only query user data if we have an authenticated session
  // Skip the query entirely while auth is loading or when not authenticated
  const user = useQuery(
    api.users.getMe,
    isAuthLoading || !isSessionAuthenticated ? "skip" : undefined
  );

  // Query organization data if user is authenticated and has an orgId
  const org = useQuery(
    api.organizations.getMyOrg,
    isAuthLoading || !isSessionAuthenticated ? "skip" : undefined
  );

  // User data is loading if session is authenticated but user query hasn't resolved
  const isUserLoading = isSessionAuthenticated && user === undefined;

  // Combined loading state: auth session loading OR user data loading
  // This ensures we wait for both the session AND user data before making auth decisions
  const isLoading = isAuthLoading || isUserLoading;

  // Authentication is determined by the session state from useConvexAuth
  // The middleware validates the session, so if isSessionAuthenticated is true,
  // the user is authenticated (even if user data query is still loading)
  // We only require user data to be loaded for the final isAuthenticated state
  // to ensure the UI has the user data it needs
  const isAuthenticated = isSessionAuthenticated && user !== null && user !== undefined;

  // Track previous state for change detection in debug logging
  const prevState = useRef({ isAuthLoading, isSessionAuthenticated, rawIsSessionAuthenticated, user, isLoading, isAuthenticated });

  // Debug logging - only log when state changes
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      const prev = prevState.current;
      const stateChanged =
        prev.isAuthLoading !== isAuthLoading ||
        prev.isSessionAuthenticated !== isSessionAuthenticated ||
        prev.rawIsSessionAuthenticated !== rawIsSessionAuthenticated ||
        prev.user !== user ||
        prev.isLoading !== isLoading ||
        prev.isAuthenticated !== isAuthenticated;

      if (stateChanged) {
        console.log("[useAuth] State changed:", {
          isAuthLoading,
          isSessionAuthenticated,
          rawIsSessionAuthenticated,
          userQueryResult: user === undefined ? "loading" : user === null ? "null" : "user",
          userEmail: user?.email || null,
          isUserLoading,
          isLoading,
          isAuthenticated,
        });
        prevState.current = { isAuthLoading, isSessionAuthenticated, rawIsSessionAuthenticated, user, isLoading, isAuthenticated };
      }
    }
  }, [isAuthLoading, isSessionAuthenticated, rawIsSessionAuthenticated, user, isLoading, isAuthenticated, isUserLoading]);

  return {
    user,
    org,
    isLoading,
    isAuthenticated,
    // Also expose the raw session auth state for components that need it
    isSessionAuthenticated,
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
