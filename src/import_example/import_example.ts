/// <reference path="../../types/aiwebengine.d.ts" />

import { buildMessage } from "./server/request-helper.ts";

function handleImportedRequest(context: HandlerContext) {
  return ResponseBuilder.text(buildMessage("request"));
}

function init(context?: HandlerContext) {
  console.info(buildMessage("init"));
  routeRegistry.registerRoute("/import-demo", "handleImportedRequest", "GET");
  routeRegistry.registerAssetRoute("/import-demo-page", "public/demo.html");
}
