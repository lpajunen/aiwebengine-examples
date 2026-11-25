// The text an article was summarised from: what the model read, kept beside
// the article so the reader can check a summary against it, and so a
// question asked in the inbox is answered from it rather than from the
// summary alone. It is either the article page's text or, when the page
// gave less, only the feed's own description, which is often a teaser.
//
// Kept under the person's own storage and shown only to them: it is the page
// as fetched for them, a private reader view.

/** Where the text came from. */
export type SourceFrom = "page" | "feed";

export interface SourceText {
  text: string;
  from: SourceFrom;
}

/** The page showing one article's source text, on this host. */
export function sourceTextPath(instance: string, id: string): string {
  return (
    "/news-digest/text?instance=" +
    encodeURIComponent(instance) +
    "&id=" +
    encodeURIComponent(id)
  );
}

/** What the text is, in a few words. */
export function sourceDescription(source: SourceText): string {
  return source.from === "page"
    ? `The article page, ${source.text.length} characters`
    : "Only the feed's description: the article page gave no more";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The article as the page names it. */
export interface SourceArticle {
  headline: string;
  originalTitle: string;
  summary: string;
  source: string;
  link: string;
  published: string | null;
}

/** The whole page; `source` is null for an article kept before texts were. */
export function sourceTextPage(
  article: SourceArticle,
  source: SourceText | null,
  backUrl: string,
): string {
  const paragraphs = source
    ? source.text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("\n")
    : '<p class="note">This article was summarised before the digest kept the text it read.</p>';
  const link = /^https?:\/\//i.test(article.link)
    ? `<a href="${escapeHtml(article.link)}" rel="noopener noreferrer">Read at ${escapeHtml(article.source || "the source")}</a>`
    : "";
  const published = article.published
    ? ` · ${escapeHtml(article.published.slice(0, 10))}`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Source text</title>
    <link rel="stylesheet" href="/engine/engine.css" />
    <style>
      body {
        padding: var(--aw-space-5) var(--aw-space-4) 4rem;
      }
      main {
        max-width: 680px;
        margin: 0 auto;
      }
      h1 {
        margin-bottom: var(--aw-space-1);
        overflow-wrap: anywhere;
      }
      .meta,
      .note {
        color: var(--aw-color-muted);
        font-size: 0.9rem;
      }
      .summary {
        background: var(--aw-color-surface);
        border: 1px solid var(--aw-color-border);
        border-radius: var(--aw-radius-lg);
        padding: var(--aw-space-3) var(--aw-space-4);
        margin: var(--aw-space-4) 0;
      }
      .summary h2,
      .text h2 {
        margin: 0 0 var(--aw-space-2);
        font-size: 0.8rem;
        text-transform: uppercase;
        color: var(--aw-color-muted);
      }
      .text p {
        overflow-wrap: anywhere;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="meta"><a href="${escapeHtml(backUrl)}">News digest</a></p>
      <h1>${escapeHtml(article.headline || article.originalTitle)}</h1>
      <p class="meta">Originally “${escapeHtml(article.originalTitle)}” · ${escapeHtml(article.source)}${published}</p>
      <div class="summary">
        <h2>Summary</h2>
        <p>${escapeHtml(article.summary)}</p>
      </div>
      <div class="text">
        <h2>What the summary was written from</h2>
        ${source ? `<p class="note">${escapeHtml(sourceDescription(source))}</p>` : ""}
        ${paragraphs}
      </div>
      <p class="meta">${link}</p>
    </main>
  </body>
</html>
`;
}
