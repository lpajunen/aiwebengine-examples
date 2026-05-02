/// <reference path="../../types/aiwebengine.d.ts" />

interface Address {
  street: string;
  city: string;
  zipCode: string;
  country: string;
}

function typescriptHandler(context: HandlerContext): HttpResponse {
  const addresses: Address[] = [
    {
      street: "123 Main St",
      city: "Anytown",
      zipCode: "12345",
      country: "USA",
    },
    {
      street: "456 Elm St",
      city: "Somewhere",
      zipCode: "67890",
      country: "Canada",
    },
    {
      street: "789 Oak Ave",
      city: "Elsewhere",
      zipCode: "54321",
      country: "UK",
    },
  ];

  let html =
    "<html><head><title>Addresses</title></head><body><h1>Sample Addresses</h1><ul>";

  for (const addr of addresses) {
    html += `<li>${addr.street}, ${addr.city}, ${addr.zipCode}, ${addr.country}</li>`;
  }

  html += "</ul></body></html>";

  return ResponseBuilder.html(html);
}

function init() {
  routeRegistry.registerRoute("/typescript", "typescriptHandler", "GET");
}
