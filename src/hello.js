/// <reference path="../types/aiwebengine.d.ts" />

/**
 * @param {HandlerContext} context
 * @returns {HttpResponse}
 */
function helloHandler(context) {
  const req = context.request;
  
  // IDE now provides autocomplete for req.query, req.method, etc.
  const name = req.query.name || "World";
  
  // IDE knows about Response.text() and its parameters
  return ResponseBuilder.text(`Hello, ${name}!`);
}

function init() {
  // Autocomplete for routeRegistry methods
  routeRegistry.registerRoute("/hello", "helloHandler", "GET");
}
