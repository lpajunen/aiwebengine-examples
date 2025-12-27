const fs = require('fs');
const path = require('path');

const endpoint = process.env.SCHEMA_ENDPOINT || 'https://softagen.com/graphql';
const accessToken = process.env.OAUTH_TOKEN || process.env.BEARER_TOKEN;

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
  const headers = { 'content-type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: introspectionQuery, operationName: 'IntrospectionQuery' }),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();

  if (payload.errors && payload.errors.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(payload.errors, null, 2)}`);
  }

  if (!payload.data) {
    throw new Error('No data returned from GraphQL endpoint');
  }

  const outDir = path.join(__dirname, '..', 'schemas');
  await fs.promises.mkdir(outDir, { recursive: true });

  const schemaPath = path.join(outDir, 'schema.json');
  await fs.promises.writeFile(schemaPath, JSON.stringify(payload.data, null, 2), 'utf8');

  const relativePath = path.relative(process.cwd(), schemaPath);
  console.log(`Saved GraphQL introspection schema to ${relativePath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
