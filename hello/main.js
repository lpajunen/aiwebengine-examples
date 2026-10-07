/// <reference path="../types/aiwebengine.d.ts" />

/**
 * @param {HandlerContext} context
 * @returns {HttpResponse}
 */
function helloHandler(context) {
  const req = context.request;
  const query = req && req.query ? req.query : {};

  // The reference above gives the IDE types for req.query, req.method, etc.
  const name = query.name || "World";

  // ResponseBuilder.text sets the status and content type
  return ResponseBuilder.text(`Hello, ${name}!`);
}

function init() {
  // Autocomplete for routeRegistry methods
  routeRegistry.registerRoute("/hello", {
    handler: "helloHandler",
    method: "GET",
  });
}
