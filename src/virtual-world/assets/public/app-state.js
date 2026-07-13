/// <reference path="virtual-world-browser-globals.d.ts" />

/** @returns {{ state: Record<string, any>, render: Record<string, any> }} */
function getVirtualWorldApp() {
  var app =
    /** @type {{ state: Record<string, any>, render: Record<string, any> } | undefined} */ (
      window["virtualWorldApp"]
    );
  if (!app || typeof app !== "object") {
    app = { state: {}, render: {} };
    window["virtualWorldApp"] = app;
  }
  if (!app.state || typeof app.state !== "object") {
    app.state = {};
  }
  if (!app.render || typeof app.render !== "object") {
    app.render = {};
  }
  return app;
}

getVirtualWorldApp();
