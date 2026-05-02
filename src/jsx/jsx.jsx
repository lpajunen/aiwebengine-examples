/// <reference path="../../types/aiwebengine.d.ts" />

function ProductCard({ name, price, description }) {
  return (
    <div className="product-card">
      <h3>{name}</h3>
      <p className="price">${price}</p>
      <p className="description">{description}</p>
    </div>
  );
}

function jsxHandler(context) {
  const products = [
    { name: "Laptop", price: 999, description: "Powerful computing device" },
    { name: "Mouse", price: 29, description: "Wireless optical mouse" },
    { name: "Keyboard", price: 79, description: "Mechanical gaming keyboard" }
  ];

  const html = (
    <html>
      <head>
        <title>Products - JSX Demo</title>
        <style>{`
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          h1 { color: #333; }
          .product-card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .price { color: #27ae60; font-size: 1.5em; font-weight: bold; }
          .description { color: #666; }
        `}</style>
      </head>
      <body>
        <h1>Product Catalog - JSX Example</h1>
        <div className="products">
          {products.map(product => (
            <ProductCard 
              name={product.name} 
              price={product.price} 
              description={product.description} 
            />
          ))}
        </div>
      </body>
    </html>
  );

  return ResponseBuilder.html(html);
}

function init() {
  routeRegistry.registerRoute("/jsx", "jsxHandler", "GET");
}
