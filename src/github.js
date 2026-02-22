/// <reference path="../types/aiwebengine.d.ts" />

/**
 * GitHub MCP Client - Fetch issues from aiwebengine-examples repository
 * This script uses the Model Context Protocol (MCP) to interact with GitHub
 */

/**
 * GitHub MCP Client wrapper class for easier interaction
 */
class GitHubMcpClient {
  constructor(serverUrl, secretIdentifier) {
    const clientDataJson = McpClient.constructor(serverUrl, secretIdentifier);
    this._clientData = JSON.parse(clientDataJson);
  }

  listTools() {
    const toolsJson = McpClient._listTools(JSON.stringify(this._clientData));
    return JSON.parse(toolsJson);
  }

  callTool(toolName, args) {
    const resultJson = McpClient._callTool(
      JSON.stringify(this._clientData),
      toolName,
      JSON.stringify(args),
    );
    return JSON.parse(resultJson);
  }
}

/**
 * Handler for /github route - fetches all issues from aiwebengine-examples
 * @param {HandlerContext} context
 * @returns {HttpResponse}
 */
function githubHandler(context) {
  try {
    // Initialize GitHub MCP client
    // Using GitHub Copilot's MCP server
    const client = new GitHubMcpClient(
      "https://api.githubcopilot.com/mcp/",
      "github_token",
    );

    // Get repository information from query params or use defaults
    const owner = context.request.query.owner || "lpajunen";
    const repo = context.request.query.repo || "aiwebengine-examples";

    // Call the list_issues tool
    const result = client.callTool("list_issues", {
      owner: owner,
      repo: repo,
    });

    // Check for errors
    if (result.error) {
      return ResponseBuilder.json(
        {
          error: "Failed to fetch issues",
          details: result.error,
          message: result.details || "Unknown error occurred",
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
        message: error.toString(),
      },
      500,
    );
  }
}

/**
 * Initialize the script - register the /github route
 */
function init() {
  routeRegistry.registerRoute("/github", "githubHandler", "GET");
  console.log("GitHub MCP script initialized - registered /github route");
  console.log(
    "Is Github token available: " + secretStorage.exists("github_token"),
  );
}
