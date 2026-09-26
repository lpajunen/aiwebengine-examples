/// <reference path="../types/aiwebengine.d.ts" />

// MCP (Model Context Protocol) Prompts Demo
// This script demonstrates how to register MCP prompts for common development tasks

/**
 * @typedef {{
 *   mode?: string,
 *   completingArgument?: string,
 *   partialValue?: string,
 *   arguments?: Record<string, string>
 * }} PromptHandlerContext
 */

// Initialization function - called when script is loaded or updated
/** @param {unknown} context */
function init(context) {
  console.log("Initializing MCP prompts demo at " + new Date().toISOString());

  // Prompt 1: Create REST API Endpoint
  mcpRegistry.registerPrompt(
    "create_rest_endpoint",
    "Generate a complete REST API endpoint with handler function and route registration. This creates a new HTTP endpoint that can handle GET/POST/PUT/DELETE requests with proper error handling and JSON responses.",
    JSON.stringify([
      {
        name: "resourceName",
        description: "The resource name (e.g., 'users', 'products', 'orders')",
        required: true,
      },
      {
        name: "method",
        description: "HTTP method (GET, POST, PUT, DELETE)",
        required: true,
      },
      {
        name: "path",
        description: "The URL path (e.g., '/api/users', '/products/:id')",
        required: true,
      },
      {
        name: "description",
        description: "Brief description of what this endpoint does",
        required: false,
      },
    ]),
    "create_rest_endpoint", // Handler function name
  );

  // Prompt 2: Add SSE Stream Endpoint
  mcpRegistry.registerPrompt(
    "add_stream_endpoint",
    "Generate a Server-Sent Events stream endpoint with a connection customizer and a broadcast helper. This creates a new SSE stream that clients subscribe to with EventSource and that the script pushes events to.",
    JSON.stringify([
      {
        name: "streamPath",
        description:
          "The stream URL path (e.g., '/events/notifications', '/events/chat')",
        required: true,
      },
      {
        name: "eventName",
        description:
          "The event name carried in each message (e.g., 'notification', 'message')",
        required: true,
      },
      {
        name: "filterField",
        description:
          "Optional connection filter field read from the query string (e.g., 'channelId')",
        required: false,
      },
    ]),
    "add_stream_endpoint", // Handler function name
  );

  console.log("MCP prompts demo script initialized successfully");
  console.log("Registered 2 MCP prompts for common development tasks");
}

// Handler for create_rest_endpoint prompt
/** @param {PromptHandlerContext} context */
function create_rest_endpoint(context) {
  // Check if we're in completion mode
  if (context.mode === "completion") {
    const completingArgument = context.completingArgument;
    const partialValue = context.partialValue || "";
    const args = context.arguments || {};

    // Provide completions based on which argument is being completed
    if (completingArgument === "method") {
      const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
      const filtered = methods.filter((m) =>
        m.toLowerCase().startsWith(partialValue.toLowerCase()),
      );
      return {
        values: filtered,
        total: filtered.length,
        hasMore: false,
      };
    }

    if (completingArgument === "resourceName") {
      // Common resource name suggestions
      const suggestions = ["users", "products", "orders", "customers", "items"];
      const filtered = suggestions.filter((s) =>
        s.toLowerCase().startsWith(partialValue.toLowerCase()),
      );
      return {
        values: filtered,
        total: filtered.length,
        hasMore: false,
      };
    }

    if (completingArgument === "path") {
      // Suggest path based on resource name if available
      const resourceName = args.resourceName || "resource";
      const method = args.method || "GET";
      const suggestions = [
        `/api/${resourceName}`,
        `/${resourceName}`,
        `/v1/${resourceName}`,
      ];

      // If it's a GET/PUT/DELETE with ID parameter
      if (method !== "POST") {
        suggestions.push(`/api/${resourceName}/:id`);
        suggestions.push(`/${resourceName}/:id`);
      }

      const filtered = suggestions.filter((s) =>
        s.toLowerCase().includes(partialValue.toLowerCase()),
      );
      return {
        values: filtered,
        total: filtered.length,
        hasMore: false,
      };
    }

    // Default: no completions
    return {
      values: [],
      total: 0,
      hasMore: false,
    };
  }

  // Prompt mode - generate the actual code
  const args = context.arguments || {};
  const resourceName = args.resourceName || "resource";
  const method = args.method || "GET";
  const path = args.path || `/api/${resourceName}`;
  const description = args.description || `${method} ${resourceName}`;

  const code = `
// ${description}
function handle${resourceName}${method}(context) {
  console.log("${method} ${path} called");
  
  // TODO: Implement ${resourceName} ${method} logic here
  
  return ResponseBuilder.json({
    success: true,
    data: []
  });
}

// Register the endpoint
routeRegistry.registerRoute("${path}", "handle${resourceName}${method}", "${method}");
console.log("Registered ${method} ${path}");
  `.trim();

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Create a ${method} endpoint at ${path} for ${resourceName}`,
        },
      },
      {
        role: "assistant",
        content: {
          type: "text",
          text: code,
        },
      },
    ],
  };
}

// Handler for add_stream_endpoint prompt
/** @param {PromptHandlerContext} context */
function add_stream_endpoint(context) {
  // Check if we're in completion mode
  if (context.mode === "completion") {
    const completingArgument = context.completingArgument;
    const partialValue = context.partialValue || "";

    if (completingArgument === "streamPath") {
      const suggestions = [
        "/events/notifications",
        "/events/chat",
        "/events/alerts",
        "/events/presence",
        "/events/updates",
      ];
      const filtered = suggestions.filter((s) =>
        s.toLowerCase().includes(partialValue.toLowerCase()),
      );
      return {
        values: filtered,
        total: filtered.length,
        hasMore: false,
      };
    }

    if (completingArgument === "eventName") {
      const suggestions = [
        "notification",
        "message",
        "alert",
        "presence",
        "update",
      ];
      const filtered = suggestions.filter((s) =>
        s.toLowerCase().startsWith(partialValue.toLowerCase()),
      );
      return {
        values: filtered,
        total: filtered.length,
        hasMore: false,
      };
    }

    if (completingArgument === "filterField") {
      const suggestions = ["channelId", "userId", "roomId", "topic"];
      const filtered = suggestions.filter((s) =>
        s.toLowerCase().startsWith(partialValue.toLowerCase()),
      );
      return {
        values: filtered,
        total: filtered.length,
        hasMore: false,
      };
    }

    // Default: no completions
    return {
      values: [],
      total: 0,
      hasMore: false,
    };
  }

  // Prompt mode - generate the actual code
  const args = context.arguments || {};
  const streamPath = args.streamPath || "/events/updates";
  const eventName = args.eventName || "update";
  const filterField = args.filterField || "";

  const suffix = eventName.charAt(0).toUpperCase() + eventName.slice(1);
  const customizerName = `${eventName}StreamCustomizer`;

  const customizer = filterField
    ? `
// Connection customizer: the returned object becomes the connection's
// metadata, which sendStreamMessageFiltered matches against.
function ${customizerName}(context) {
  const req = context.request;
  const ${filterField} = (req.query || {}).${filterField};

  if (!${filterField}) {
    return {};
  }

  return { ${filterField}: String(${filterField}) };
}
`.trim()
    : "";

  const broadcast = filterField
    ? `
// Push an event to the connections that asked for this ${filterField}
function broadcast${suffix}(${filterField}, payload) {
  return routeRegistry.sendStreamMessageFiltered(
    "${streamPath}",
    { event: "${eventName}", ...payload },
    JSON.stringify({ ${filterField}: String(${filterField}) }),
  );
}
`.trim()
    : `
// Push an event to every connection on the stream
function broadcast${suffix}(payload) {
  return routeRegistry.sendStreamMessage("${streamPath}", {
    event: "${eventName}",
    ...payload,
  });
}
`.trim();

  const registration = filterField
    ? `routeRegistry.registerStreamRoute("${streamPath}", "${customizerName}");`
    : `routeRegistry.registerStreamRoute("${streamPath}");`;

  const eventSourceArg = filterField
    ? `"${streamPath}?${filterField}=" + ${filterField}`
    : `"${streamPath}"`;

  const code = [
    `// SSE stream: ${streamPath}`,
    customizer,
    broadcast,
    `// Register the stream (from init())
${registration}
console.log("Registered stream ${streamPath}");`,
    `// Browser side:
// const es = new EventSource(${eventSourceArg});
// es.onmessage = (e) => console.log(JSON.parse(e.data));`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Create an SSE stream at ${streamPath} that broadcasts ${eventName} events`,
        },
      },
      {
        role: "assistant",
        content: {
          type: "text",
          text: code,
        },
      },
    ],
  };
}
