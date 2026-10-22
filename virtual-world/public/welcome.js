// The welcome page's chronicle: what has happened in Väinölä lately, in
// verse (server/chronicle.ts), in Finnish for a Finnish reader and English
// for everyone else. Nothing is shown until there is something to tell.

(function () {
  var finnish =
    String(navigator.language || "")
      .toLowerCase()
      .indexOf("fi") === 0;
  var found = document.getElementById("chronicle");
  var foundList = document.getElementById("chronicle-entries");
  if (!found || !foundList) return;
  var section = found;
  var list = foundList;
  fetch("/virtual-world/chronicle")
    .then(function (res) {
      return res.json();
    })
    .then(function (body) {
      var entries = body && Array.isArray(body.entries) ? body.entries : [];
      if (entries.length === 0) return;
      var title = document.getElementById("chronicle-title");
      if (title && finnish) title.textContent = "Väinölän kronikka";
      entries.forEach(function (/** @type {any} */ entry) {
        var lines = finnish ? entry.lines.fi : entry.lines.en;
        var verse = document.createElement("p");
        verse.className = "chronicle-entry";
        lines.forEach(
          function (/** @type {string} */ line, /** @type {number} */ i) {
            if (i > 0) verse.appendChild(document.createElement("br"));
            verse.appendChild(document.createTextNode(line));
          },
        );
        list.appendChild(verse);
      });
      section.hidden = false;
    })
    .catch(function () {});
})();
