/// <reference path="../types/aiwebengine.d.ts" />

// Example script demonstrating the fetch() API
// This script shows how to make HTTP requests to external APIs

/**
 * Initialize fetch example routes
 */
function init() {
  console.log("Initializing fetch_example.js");
  routeRegistry.registerRoute("/fetch/example", "fetchExample", "GET");
  routeRegistry.registerRoute("/fetch/with-secret", "fetchWithSecret", "GET");
  routeRegistry.registerRoute("/fetch/post", "fetchPost", "POST");
}

const FETCH_EXAMPLE_EMPTY_REQUEST = /** @type {HttpRequest} */ ({
  path: "",
  method: "GET",
  headers: /** @type {Headers & Record<string, string>} */ (new Headers()),
  query: {},
  params: {},
  form: {},
  body: "",
  searchParams: new URLSearchParams(),
  text: () => "",
  json: () => ({}),
  files: [],
});

// Example 1: Simple GET request
/** @param {HandlerContext} context */
function fetchExample(context) {
  const req = context.request || FETCH_EXAMPLE_EMPTY_REQUEST;

  // Validate query parameters
  const url = req.query && req.query.url;
  if (!url || url.trim() === "") {
    return ResponseBuilder.error(400, "URL parameter is required");
  }

  console.log("Fetching data from: " + url);

  try {
    const response = fetch(url);

    if (response.ok) {
      console.log("Fetch successful! Status: " + response.status);
      return ResponseBuilder.json({
        message: "Fetch successful",
        data: response.json(),
      });
    } else {
      return ResponseBuilder.error(response.status, "Request failed");
    }
  } catch (error) {
    console.error("Fetch error: " + error);
    return ResponseBuilder.error(500, "Internal error: " + error);
  }
}

// Example 2: Using secret injection for API keys
/** @param {HandlerContext} context */
function fetchWithSecret(context) {
  console.log("Fetching with secret injection");

  // Check if the secret exists
  if (!secretStorage.exists("example_api_key")) {
    return ResponseBuilder.error(
      503,
      "API key not configured. Please set 'example_api_key' in secrets configuration",
    );
  }

  try {
    // Use {{secret:NAME}} syntax to inject the API key. A bare {{NAME}} is
    // not substituted — it would be sent to the far end as literal text.
    const options = {
      method: "GET",
      headers: {
        "X-API-Key": "{{secret:example_api_key}}",
        "User-Agent": "aiwebengine/fetch-example",
      },
    };

    // This would work with a real API that requires authentication
    // For demo purposes, we'll use httpbin
    const response = fetch("https://httpbin.org/headers", options);

    if (response.ok) {
      const data = /** @type {{ headers: Record<string, string> }} */ (
        response.json()
      );
      return ResponseBuilder.json({
        message: "Request with secret successful",
        headers: data.headers,
      });
    } else {
      return ResponseBuilder.error(response.status, "Request failed");
    }
  } catch (error) {
    console.error("Fetch error: " + error);
    return ResponseBuilder.error(500, "Internal error: " + error);
  }
}

// Example 3: POST request with JSON body
/** @param {HandlerContext} context */
function fetchPost(context) {
  const req = context.request || FETCH_EXAMPLE_EMPTY_REQUEST;
  console.log("Making POST request");

  // Validate required form parameters
  const name = req.form && req.form.name;
  if (!name || name.trim() === "") {
    return ResponseBuilder.error(400, "Name parameter is required");
  }

  const email = req.form && req.form.email;
  if (!email || email.trim() === "") {
    return ResponseBuilder.error(400, "Email parameter is required");
  }

  try {
    const requestData = {
      name: name,
      email: email,
      timestamp: new Date().toISOString(),
    };

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestData),
    };

    const response = fetch("https://httpbin.org/post", options);

    if (response.ok) {
      const data = /** @type {{ json: unknown }} */ (response.json());
      return ResponseBuilder.json({
        message: "POST successful",
        sentData: requestData,
        echo: data.json,
      });
    } else {
      return ResponseBuilder.error(response.status, "POST failed");
    }
  } catch (error) {
    console.error("POST error: " + error);
    return ResponseBuilder.error(500, "Internal error: " + error);
  }
}
