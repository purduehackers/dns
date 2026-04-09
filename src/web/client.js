var STORAGE_KEY = "sitemap-visited";

function getVisited() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveVisited(visited) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]));
}

function h(tag, attrs, ...children) {
  var el = document.createElement(tag);
  if (attrs)
    for (var k in attrs) {
      if (k === "class") el.className = attrs[k];
      else if (k.startsWith("on")) {
        var event = k.replace(/^on/, "");
        el.addEventListener(event.toLowerCase(), attrs[k]);
      } else el.setAttribute(k, attrs[k]);
    }
  for (var c of children.flat()) {
    if (c == null) continue;
    el.append(typeof c === "string" ? c : c);
  }
  return el;
}

var visited = getVisited();
var zones = null;

function render() {
  var root = document.getElementById("app");
  root.innerHTML = "";

  var total = zones.reduce(function (n, z) {
    return n + z.subdomains.length;
  }, 0);
  var count = zones.reduce(function (n, z) {
    return (
      n +
      z.subdomains.filter(function (s) {
        return visited.has(s + "." + z.domain);
      }).length
    );
  }, 0);

  root.append(
    h("h1", null, "Purdue Hackers Sitemap"),
    h(
      "p",
      { class: "description" },
      "All subdomains on *.purduehackers.com, generated from our DNS configuration as code! ",
      h(
        "a",
        {
          href: "https://github.com/purduehackers/dns",
          target: "_blank",
          rel: "noopener noreferrer",
        },
        "View on GitHub",
      ),
    ),
  );

  if (total > 0 && count === total) {
    root.append(
      h("p", { class: "congrats" }, "You explored all " + total + " Purdue Hackers websites!"),
    );
  }

  var container = h("div", { class: "zones" });
  for (var zone of zones) {
    var zoneTotal = zone.subdomains.length;
    var zoneCount = zone.subdomains.filter(function (s) {
      return visited.has(s + "." + zone.domain);
    }).length;

    var header = h("div", { class: "zone-domain" }, zone.domain);
    if (zoneCount > 0) {
      header.append(h("span", { class: "visited-count" }, "(" + zoneCount + "/" + zoneTotal + ")"));
    }

    var list = h("div", { class: "subdomains" });
    for (var sub of zone.subdomains) {
      var full = sub + "." + zone.domain;
      var row = h(
        "div",
        { class: "subdomain" },
        h(
          "a",
          {
            href: "https://" + full,
            target: "_blank",
            rel: "noopener noreferrer",
            onclick: (function (domain) {
              return function () {
                visited.add(domain);
                saveVisited(visited);
                render();
              };
            })(full),
          },
          full,
        ),
      );
      if (visited.has(full)) {
        row.append(h("span", { class: "checkmark" }, "\u2713"));
      }
      list.append(row);
    }

    container.append(h("div", null, header, list));
  }
  root.append(container);
}

void fetch("/api/zones")
  .then(function (r) {
    return r.json();
  })
  .then(function (data) {
    zones = data;
    render();
  });
