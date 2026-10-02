/// <reference path="../types/aiwebengine.d.ts" />

/**
 * GitHub MCP Client - Fetch issues from aiwebengine-examples repository
 * This script uses the Model Context Protocol (MCP) to interact with GitHub
 */

/**
 * Handler for /github route - fetches all issues from aiwebengine-examples
 * @param {HandlerContext} context
 * @returns {HttpResponse}
 */
function githubHandler(context) {
  try {
    // Initialize GitHub MCP client
    // Using GitHub Copilot's MCP server
    const client = new McpClient(
      "https://api.githubcopilot.com/mcp/",
      "github_token",
    );

    // Get repository information from query params or use defaults
    const request = context.request;
    const query = request && request.query ? request.query : {};
    const owner = query.owner || "lpajunen";
    const repo = query.repo || "aiwebengine-examples";

    // Call the list_issues tool; a JSON-RPC error throws
    let result;
    try {
      result = client.callTool("list_issues", { owner, repo });
    } catch (error) {
      return ResponseBuilder.json(
        {
          error: "Failed to fetch issues",
          message: /** @type {Error} */ (error).message,
        },
        400,
      );
    }

    // Return the issues
    return ResponseBuilder.json({
      success: true,
      owner: owner,
      repo: repo,
      issues: result.content || result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Handle any unexpected errors
    return ResponseBuilder.json(
      {
        error: "Internal server error",
        message: String(error),
      },
      500,
    );
  }
}

/**
 * Initialize the script - register the /github route
 */
function init() {
  routeRegistry.registerRoute("/github", {
    handler: "githubHandler",
    method: "GET",
  });
  console.log("GitHub MCP script initialized - registered /github route");
  console.log(
    "Is Github token available: " + secretStorage.exists("github_token"),
  );
}
