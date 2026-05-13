import { buildMessage } from "./server/request-helper.ts";

function handleImportedRequest(context) {
    return ResponseBuilder.text(buildMessage("request"));
}

function init(context) {
    console.info(buildMessage("init"));
    routeRegistry.registerRoute("/import-demo", "handleImportedRequest", "GET");
    routeRegistry.registerAssetRoute("/import-demo-page", "public/demo.html");
}
