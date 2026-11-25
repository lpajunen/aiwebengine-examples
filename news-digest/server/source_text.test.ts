/** Tests for the page showing the text an article was summarised from. */

import { sourceTextPage } from "./source_text.ts";

const ARTICLE = {
  headline: "Tappara fired its coach",
  originalTitle: "<b>Shock</b> at Tappara",
  summary: "The coach went after a month.",
  source: "Ilta-Sanomat",
  link: "https://www.is.fi/a/1",
  published: "2026-11-25T09:22:00+00:00",
};

describe("sourceTextPage", function () {
  test("shows the text in paragraphs, escaped, and says where it came from", function () {
    const html = sourceTextPage(
      ARTICLE,
      { text: "First <script>.\n\nSecond.", from: "page" },
      "/news-digest",
    );
    expect(html).toContain("<p>First &lt;script&gt;.</p>");
    expect(html).toContain("<p>Second.</p>");
    expect(html).toContain("&lt;b&gt;Shock&lt;/b&gt;");
    expect(html).toContain("The article page, 25 characters");
    expect(html).toContain('href="https://www.is.fi/a/1"');
  });

  test("says when only the feed's description was read", function () {
    const html = sourceTextPage(
      ARTICLE,
      { text: "Teaser.", from: "feed" },
      "/news-digest",
    );
    expect(html).toContain("Only the feed's description");
  });

  test("explains an article kept before texts were, and links only http(s)", function () {
    const html = sourceTextPage(
      { ...ARTICLE, link: "javascript:alert(1)" },
      null,
      "/news-digest",
    );
    expect(html).toContain("before the digest kept the text");
    expect(html).not.toContain("javascript:");
  });
});
