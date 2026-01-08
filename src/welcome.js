/// <reference path="../types/aiwebengine.d.ts" />

// Welcome page
// Serves a friendly welcome message at the root path

function servePage(context) {
  const req = context.req;
  try {
    const html =
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Welcome</title>\n  <style>\n    * {\n      margin: 0;\n      padding: 0;\n      box-sizing: border-box;\n    }\n    body {\n      font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif;\n      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n      min-height: 100vh;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n    }\n    .container {\n      background: white;\n      padding: 60px 40px;\n      border-radius: 10px;\n      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);\n      text-align: center;\n      max-width: 600px;\n    }\n    h1 {\n      color: #333;\n      font-size: 2.5em;\n      margin-bottom: 20px;\n    }\n    p {\n      color: #666;\n      font-size: 1.1em;\n      line-height: 1.6;\n      margin-bottom: 30px;\n    }\n    .emoji {\n      font-size: 3em;\n      margin-bottom: 20px;\n    }\n  </style>\n</head>\n<body>\n  <div class="container">\n    <div class="emoji">👋</div>\n    <h1>Welcome!</h1>\n    <p>Thank you for visiting our site. We\'re thrilled to have you here!</p>\n    <p>Explore, discover, and enjoy your experience with us.</p>\n  </div>\n</body>\n</html>';
    return {
      status: 200,
      body: html,
      contentType: "text/html; charset=UTF-8",
    };
  } catch (error) {
    console.error("Error: " + error);
    return { status: 500, body: "Internal error" };
  }
}

function init(context) {
  console.log("Initializing welcome page");
  routeRegistry.registerRoute("/", "servePage", "GET");
  return { success: true };
}
