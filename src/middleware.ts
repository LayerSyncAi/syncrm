import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// Routes that require authentication
const isProtectedRoute = createRouteMatcher(["/app(.*)"]);

// Routes that are only for unauthenticated users
const isPublicAuthRoute = createRouteMatcher([
  "/login",
  "/forgot-password",
  "/reset-password",
]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuthenticated = await convexAuth.isAuthenticated();
  const url = request.nextUrl;

  // Debug logging in development
  if (process.env.NODE_ENV === "development") {
    console.log("[Middleware] Path:", url.pathname, "Authenticated:", isAuthenticated);
  }

  // Redirect unauthenticated users from protected routes to login
  if (isProtectedRoute(request) && !isAuthenticated) {
    if (process.env.NODE_ENV === "development") {
      console.log("[Middleware] Redirecting to /login - not authenticated");
    }
    return nextjsMiddlewareRedirect(request, "/login");
  }

  // Redirect authenticated users from auth pages to dashboard
  if (isPublicAuthRoute(request) && isAuthenticated) {
    if (process.env.NODE_ENV === "development") {
      console.log("[Middleware] Redirecting to /app/dashboard - already authenticated");
    }
    return nextjsMiddlewareRedirect(request, "/app/dashboard");
  }
});

export const config = {
  // Match all routes except static files and Next.js internals
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
