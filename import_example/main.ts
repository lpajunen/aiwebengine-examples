/// <reference path="../types/aiwebengine.d.ts" />

import { buildMessage } from "./server/request-helper.ts";

function handleImportedRequest(context: HandlerContext) {
  return ResponseBuilder.text(buildMessage("request"));
}

function init(context?: HandlerContext) {
  console.info(buildMessage("init"));
  routeRegistry.registerRoute("/import-demo", {
    handler: "handleImportedRequest",
    method: "GET",
  });
  routeRegistry.registerRoute("/import-demo-page", {
    file: "public/demo.html",
  });
}
