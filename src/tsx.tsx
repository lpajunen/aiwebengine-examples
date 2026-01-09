/// <reference path="../types/aiwebengine.d.ts" />

interface Book {
  title: string;
  author: string;
  year: number;
  genre: string;
}

interface BookCardProps {
  book: Book;
}

function BookCard({ book }: BookCardProps): JSX.Element {
  return (
    <div className="book-card">
      <h3>{book.title}</h3>
      <p className="author">by {book.author}</p>
      <div className="meta">
        <span className="year">{book.year}</span>
        <span className="genre">{book.genre}</span>
      </div>
    </div>
  );
}

function tsxHandler(context: HandlerContext): HttpResponse {
  const books: Book[] = [
    { title: "The Great Gatsby", author: "F. Scott Fitzgerald", year: 1925, genre: "Classic" },
    { title: "1984", author: "George Orwell", year: 1949, genre: "Dystopian" },
    { title: "To Kill a Mockingbird", author: "Harper Lee", year: 1960, genre: "Classic" }
  ];

  const html = (
    <html>
      <head>
        <title>Books - TSX Demo</title>
        <style>{`
          body { 
            font-family: 'Georgia', serif; 
            padding: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            margin: 0;
          }
          .container { 
            max-width: 800px; 
            margin: 0 auto; 
            background: white; 
            padding: 30px; 
            border-radius: 12px; 
            box-shadow: 0 10px 40px rgba(0,0,0,0.2); 
          }
          h1 { color: #2c3e50; text-align: center; margin-bottom: 30px; }
          .book-card { 
            background: #f8f9fa; 
            padding: 20px; 
            margin: 15px 0; 
            border-radius: 8px; 
            border-left: 4px solid #667eea;
            transition: transform 0.2s;
          }
          .book-card:hover { transform: translateX(5px); }
          .book-card h3 { margin: 0 0 10px 0; color: #2c3e50; }
          .author { color: #7f8c8d; font-style: italic; margin: 5px 0; }
          .meta { display: flex; gap: 15px; margin-top: 10px; }
          .year, .genre { 
            background: #667eea; 
            color: white; 
            padding: 4px 12px; 
            border-radius: 4px; 
            font-size: 0.9em; 
          }
        `}</style>
      </head>
      <body>
        <div className="container">
          <h1>📚 Book Collection - TSX Example</h1>
          <div className="books">
            {books.map((book: Book) => (
              <BookCard book={book} />
            ))}
          </div>
        </div>
      </body>
    </html>
  );

  return ResponseBuilder.html(html);
}

function init(): void {
  routeRegistry.registerRoute("/tsx", "tsxHandler", "GET");
}
