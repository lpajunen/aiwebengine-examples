/**
 * File Upload Example
 *
 * This example demonstrates handling file uploads via multipart form data.
 * Files are received as base64-encoded data with metadata (filename, content type, size).
 *
 * Usage:
 * POST /upload with multipart/form-data containing:
 * - file field with uploaded file
 * - optional text fields (name, description, etc.)
 *
 * Maximum file size: 10MB (configurable via max_upload_size_bytes)
 */

/** How much of a decoded text file to echo back as a preview. */
const PREVIEW_LIMIT = 200;

/**
 * @param {HandlerContext} context
 * @returns {HttpResponse}
 */
function handleUpload(context) {
  const request = context.request;
  if (!request) {
    return {
      status: 400,
      body: JSON.stringify({ error: "Missing request" }),
      contentType: "application/json",
    };
  }

  // Check if any files were uploaded
  if (!request.files || request.files.length === 0) {
    return {
      status: 400,
      body: JSON.stringify({
        error: "No files uploaded",
        message: "Please include a file in your multipart form data",
      }),
      contentType: "application/json",
    };
  }

  // Process uploaded files
  const filesInfo = request.files.map((file) => {
    // Decode the base64 payload for text files. `convert.atob` is the engine's
    // base64 decoder — there is no global atob() and no Buffer in the sandbox.
    let preview = null;
    if (file.contentType && file.contentType.startsWith("text/")) {
      try {
        const text = convert.atob(file.data);
        preview =
          text.length > PREVIEW_LIMIT
            ? text.slice(0, PREVIEW_LIMIT) + "…"
            : text;
      } catch (e) {
        preview = "Unable to preview";
      }
    }

    return {
      field: file.field,
      filename: file.filename || "unnamed",
      contentType: file.contentType || "unknown",
      size: file.size,
      preview: preview,
      // In a real application, you might:
      // - Save the decoded data with assetStorage.upsertAsset()
      // - Process image files
      // - Validate file types
      // - Scan for malware
    };
  });

  // Extract form fields (non-file data)
  /** @type {Record<string, string>} */
  const formFields = {};
  for (const [key, value] of Object.entries(request.form)) {
    formFields[key] = value;
  }

  return {
    status: 200,
    body: JSON.stringify(
      {
        message: "Files uploaded successfully",
        filesCount: request.files.length,
        files: filesInfo,
        formFields: formFields,
        metadata: {
          path: request.path,
          method: request.method,
        },
      },
      null,
      2,
    ),
    contentType: "application/json",
  };
}

/**
 * Register the route on script initialization.
 */
function init() {
  routeRegistry.registerRoute("/upload", "handleUpload", "POST");
}
