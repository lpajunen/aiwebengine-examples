/// <reference path="../types/aiwebengine.d.ts" />

/**
 * Authentication Roles Demo
 *
 * Demonstrates how to use authentication and authorization features with
 * the aiwebengine AuthContext API.
 *
 * Note: AuthContext is always present; use isAuthenticated to check login status.
 * Properties: isAuthenticated, isAdmin, isEditor, userId, userEmail, userName, provider
 */

function handleRequest(context) {
  const request = context.request || {};

  // Check if user is authenticated
  if (!request.auth.isAuthenticated) {
    return ResponseBuilder.json(
      {
        error: "Authentication required",
        message: "Please login to access this resource",
      },
      401,
    );
  }

  // Get current user information from AuthContext
  const auth = request.auth;

  // Build response based on user roles
  const roles = ["Authenticated"];
  if (auth.isAdmin) {
    roles.push("Administrator");
  }
  if (auth.isEditor) {
    roles.push("Editor");
  }

  // Example: Restrict certain actions to editors or admins
  if (
    request.method === "POST" ||
    request.method === "PUT" ||
    request.method === "DELETE"
  ) {
    if (!auth.isEditor && !auth.isAdmin) {
      return ResponseBuilder.json(
        {
          error: "Insufficient permissions",
          message: "Editor or Administrator role required for this action",
        },
        403,
      );
    }
  }

  // Example: Restrict admin-only paths
  if (request.path === "/admin/settings" && !auth.isAdmin) {
    return ResponseBuilder.json(
      {
        error: "Insufficient permissions",
        message: "Administrator role required for this action",
      },
      403,
    );
  }

  // Return user info and capabilities
  return ResponseBuilder.json({
    user: {
      id: auth.userId,
      email: auth.userEmail,
      name: auth.userName,
      provider: auth.provider,
    },
    roles: roles,
    capabilities: {
      canView: true,
      canEdit: auth.isEditor || auth.isAdmin,
      canAdminister: auth.isAdmin,
    },
    message: `Welcome ${auth.userName || auth.userEmail}! You have ${roles.join(", ")} access.`,
  });
}

/**
 * Example: Editor-only endpoint
 */
function editorOnly(context) {
  const request = context.request || {};

  // Check authentication
  if (!request.auth.isAuthenticated) {
    return ResponseBuilder.json(
      {
        error: "Authentication required",
      },
      401,
    );
  }

  // Check editor role (editors and admins can access)
  if (!request.auth.isEditor && !request.auth.isAdmin) {
    return ResponseBuilder.json(
      {
        error: "Editor access required",
      },
      403,
    );
  }

  return ResponseBuilder.text(
    `Hello ${request.auth.userName}, you have editor access!`,
  );
}

/**
 * Example: Admin-only endpoint
 */
function adminOnly(context) {
  const request = context.request || {};

  // Check authentication
  if (!request.auth.isAuthenticated) {
    return ResponseBuilder.json(
      {
        error: "Authentication required",
      },
      401,
    );
  }

  // Check admin role
  if (!request.auth.isAdmin) {
    return ResponseBuilder.json(
      {
        error: "Administrator access required",
      },
      403,
    );
  }

  return ResponseBuilder.text(
    `Hello ${request.auth.userName}, you have administrator access!`,
  );
}

function init() {
  routeRegistry.registerRoute("/auth/demo", "handleRequest", "GET");
  routeRegistry.registerRoute("/auth/editor", "editorOnly", "GET");
  routeRegistry.registerRoute("/auth/admin", "adminOnly", "GET");
}
