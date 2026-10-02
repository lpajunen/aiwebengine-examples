/**
 * GitHub MCP Client Example
 *
 * This example demonstrates how to use the McpClient to connect to GitHub's MCP server
 * and fetch issues from a repository.
 *
 * Prerequisites:
 * 1. Set SECRET_GITHUB_TOKEN in your .env file
 *    Get token from: https://github.com/settings/tokens
 *    Required scopes: 'repo' (for private repos) or 'public_repo' (for public repos only)
 *
 * 2. GitHub MCP Server URL: https://api.githubcopilot.com/mcp/
 *
 * Usage:
 * - This script can be used as a reference for implementing MCP client functionality
 * - McpClient is a global class: listTools() and callTool() answer in values
 *   and throw on a JSON-RPC error (the error carries its `code`)
 */

/**
 * Main function to demonstrate GitHub MCP integration
 */
function demonstrateGitHubMcp() {
  try {
    console.log("=== GitHub MCP Client Demo ===\n");

    // 1. Create MCP client connected to GitHub's MCP server
    console.log("1. Connecting to GitHub MCP server...");
    const client = new McpClient(
      "https://api.githubcopilot.com/mcp/",
      "github_token",
    );
    console.log("   ✓ Connected\n");

    // 2. List available tools
    console.log("2. Discovering available tools...");
    const tools = client.listTools();
    console.log(`   ✓ Found ${tools.length} tools\n`);

    // Display first few tools
    console.log("   Available tools:");
    tools.slice(0, 10).forEach((tool) => {
      console.log(`   - ${tool.name}: ${tool.description || "No description"}`);
    });
    if (tools.length > 10) {
      console.log(`   ... and ${tools.length - 10} more tools\n`);
    }

    // 3. Fetch a specific issue from GitHub MCP Server repository
    console.log("\n3. Fetching issue #1 from github/github-mcp-server...");
    let issue;
    try {
      issue = client.callTool("issue_read:get", {
        owner: "github",
        repo: "github-mcp-server",
        issue_number: 1,
      });
    } catch (error) {
      const message = /** @type {Error} */ (error).message;
      console.log(`   ✗ Error: ${message}`);
      return { success: false, error: message };
    }

    console.log("   ✓ Issue fetched successfully\n");
    console.log("   Issue Details:");
    console.log(`   - Title: ${issue.title || "N/A"}`);
    console.log(`   - State: ${issue.state || "N/A"}`);
    console.log(`   - Author: ${issue.user?.login || "N/A"}`);
    console.log(`   - Created: ${issue.created_at || "N/A"}`);
    console.log(`   - Comments: ${issue.comments || 0}`);

    if (issue.body) {
      const bodyPreview = issue.body.substring(0, 200);
      console.log(
        `   - Body: ${bodyPreview}${issue.body.length > 200 ? "..." : ""}`,
      );
    }

    console.log("\n=== Demo Complete ===");

    return {
      success: true,
      toolCount: tools.length,
      issue: {
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login,
      },
    };
  } catch (error) {
    const err = /** @type {Error} */ (error);
    console.error("\n✗ Error:", err.message);
    console.error("Stack:", err.stack);

    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Example: List all open issues from a repository
 * @param {string} owner
 * @param {string} repo
 * @param {string} [state]
 */
function listRepositoryIssues(owner, repo, state = "open") {
  try {
    const client = new McpClient(
      "https://api.githubcopilot.com/mcp/",
      "github_token",
    );

    console.log(`\nListing ${state} issues for ${owner}/${repo}...\n`);

    // Note: The exact tool name and arguments depend on the GitHub MCP server implementation
    // This is an example - adjust based on actual available tools
    const result = client.callTool("issue_read:list", {
      owner: owner,
      repo: repo,
      state: state,
    });

    /** @type {any[]} */
    const issues = result.issues || [];

    console.log(`Found ${issues.length} ${state} issues:\n`);
    issues.forEach((/** @type {any} */ issue, /** @type {number} */ index) => {
      console.log(`${index + 1}. #${issue.number} - ${issue.title}`);
      console.log(`   Author: ${issue.user?.login}, State: ${issue.state}`);
    });

    return issues;
  } catch (error) {
    console.error("Error:", /** @type {Error} */ (error).message);
    return [];
  }
}

/**
 * Export functions for use in other scripts or as HTTP handlers
 */
// Uncomment to register as HTTP endpoint:
// routeRegistry.registerRoute('/github-mcp-demo', { handler: 'demonstrateGitHubMcp', method: 'GET' });
// routeRegistry.registerRoute('/github-issues/:owner/:repo', { handler: 'listRepositoryIssues', method: 'GET' });

// For testing, run the demo
// demonstrateGitHubMcp();
