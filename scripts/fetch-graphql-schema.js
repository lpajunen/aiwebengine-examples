/// <reference types="node" />
const fs = require("fs");
const path = require("path");

const endpoint = process.env.SCHEMA_ENDPOINT || "https://softagen.com/graphql";
let accessToken = process.env.OAUTH_TOKEN || process.env.BEARER_TOKEN;
const cookie =
  process.env.GRAPHQL_COOKIE ||
  process.env.SESSION_COOKIE ||
  process.env.COOKIE;
const referer = process.env.GRAPHQL_REFERER;
const csrfToken = process.env.CSRF_TOKEN || process.env.XSRF_TOKEN;
const useGet =
  process.env.GRAPHQL_METHOD === "GET" || process.env.SCHEMA_GET === "1";

// Load token from schemas/token.json if env var not provided
try {
  if (!accessToken) {
    const tokenFile = path.join(__dirname, "..", "schemas", "token.json");
    if (fs.existsSync(tokenFile)) {
      const raw = fs.readFileSync(tokenFile, "utf8");
      const tok = JSON.parse(raw);
      if (tok && tok.access_token) {
        accessToken = tok.access_token;
      }
    }
  }
} catch (e) {
  // ignore token file errors in runtime
}

// Standard GraphQL introspection query (without descriptions) to export schema JSON.
const introspectionQuery = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        ...FullType
      }
      directives {
        name
        locations
        args {
          ...InputValue
        }
      }
    }
  }

  fragment FullType on __Type {
    kind
    name
    fields(includeDeprecated: true) {
      name
      args {
        ...InputValue
      }
      type {
        ...TypeRef
      }
      isDeprecated
      deprecationReason
    }
    inputFields {
      ...InputValue
    }
    interfaces {
      ...TypeRef
    }
    enumValues(includeDeprecated: true) {
      name
      isDeprecated
      deprecationReason
    }
    possibleTypes {
      ...TypeRef
    }
  }

  fragment InputValue on __InputValue {
    name
    type { ...TypeRef }
    defaultValue
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

async function main() {
  /** @type {Record<string, string>} */
  const headers = { accept: "application/json" };
  if (!useGet) {
    headers["content-type"] = "application/json";
  }
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  if (cookie) {
    headers["Cookie"] = cookie;
  }
  if (referer) {
    headers["Referer"] = referer;
  }
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  // Helpful header to mimic browser-originated XHR
  headers["X-Requested-With"] = "XMLHttpRequest";

  if (process.env.DRY_RUN) {
    // Print computed configuration without performing a network request.
    console.log("DRY_RUN enabled: showing request config only");
    console.log(
      JSON.stringify(
        { endpoint, headers, body: { operationName: "IntrospectionQuery" } },
        null,
        2,
      ),
    );
    return;
  }

  let response;
  if (useGet) {
    const url = new URL(endpoint);
    url.searchParams.set("query", introspectionQuery);
    url.searchParams.set("operationName", "IntrospectionQuery");
    response = await fetch(url, {
      method: "GET",
      headers,
    });
  } else {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: introspectionQuery,
        operationName: "IntrospectionQuery",
      }),
    });
  }

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (e) {
    const text = await response.text();
    throw new Error(
      `Failed to parse JSON. Status ${response.status}. Body: ${text.slice(0, 500)}`,
    );
  }

  if (payload.errors && payload.errors.length) {
    throw new Error(
      `GraphQL errors: ${JSON.stringify(payload.errors, null, 2)}`,
    );
  }

  if (!payload.data) {
    throw new Error("No data returned from GraphQL endpoint");
  }

  const outDir = path.join(__dirname, "..", "schemas");
  await fs.promises.mkdir(outDir, { recursive: true });

  const schemaPath = path.join(outDir, "schema.json");
  await fs.promises.writeFile(
    schemaPath,
    JSON.stringify(payload.data, null, 2),
    "utf8",
  );

  const relativePath = path.relative(process.cwd(), schemaPath);
  console.log(`Saved GraphQL introspection schema to ${relativePath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
