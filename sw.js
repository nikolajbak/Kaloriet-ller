/*
 * Service worker til Kaloriedagbogen.
 *
 * VIGTIGSTE PRINCIP: netværk først for selve siden.
 * Den klassiske grund til, at web-apps sætter sig fast i en gammel udgave, er
 * en service worker der serverer fra cache først. Her spørges nettet altid
 * først, og cachen bruges kun, når der ikke er forbindelse. Appens eget
 * versionstjek fungerer derfor uændret.
 *
 * API-kald til Anthropic, Unsplash og Wikimedia røres ikke — de går udenom
 * denne fil, så der aldrig gemmes svar med dine måltider i en cache.
 */

var CACHE = "kaloriedagbog-skal-3";

var SKAL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Enkeltvis, så én manglende fil ikke vælter hele installationen
      return Promise.all(
        SKAL.map(function (u) {
          return c.add(new Request(u, { cache: "reload" })).catch(function () {});
        })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (navne) {
      return Promise.all(
        navne.map(function (n) { return n === CACHE ? null : caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;

  // Kun egne filer og kun hentninger. Alt andet passerer urørt.
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (fejl) { return; }
  if (url.origin !== self.location.origin) return;

  // Selve siden: netværk først, cache som nødløsning.
  // Afgørelsen træffes på ADRESSEN, ikke på hvordan kaldet er stillet. Appens eget
  // versionstjek henter index.html med en almindelig fetch — den er hverken en
  // navigation eller mærket text/html, og den ramte derfor tidligere cachen og så
  // aldrig en ny version.
  var sti = url.pathname;
  var erSiden = sti.slice(-1) === "/" || sti.slice(-5) === ".html";
  if (erSiden || req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (svar) {
        if (svar && svar.ok) {
          var kopi = svar.clone();
          caches.open(CACHE).then(function (c) { c.put("./index.html", kopi); });
        }
        return svar;
      }).catch(function () {
        return caches.match("./index.html").then(function (truffet) {
          return truffet || caches.match(req, { ignoreSearch: true });
        });
      })
    );
    return;
  }

  // Alt med en forespørgselsstreng går uden om cachen — den slags er altid
  // et bevidst forsøg på at hente noget friskt
  if (url.search) return;

  // Ikoner og manifest: cache først, men hentes stille i baggrunden
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (truffet) {
      var fra_nettet = fetch(req).then(function (svar) {
        if (svar && svar.ok) {
          var kopi = svar.clone();
          caches.open(CACHE).then(function (c) { c.put(req, kopi); });
        }
        return svar;
      }).catch(function () { return truffet; });
      return truffet || fra_nettet;
    })
  );
});

/* Appen kan bede den nye udgave om at overtage med det samme */
self.addEventListener("message", function (e) {
  if (e.data === "overtag") self.skipWaiting();
});

/* ------------------------------------------------------------
   Push. iOS leverer kun til hjemmeskærms-apps, og kun når der er
   en synlig besked — der findes ingen stille push.
   ------------------------------------------------------------ */
self.addEventListener("push", function (e) {
  var d = { title: "Kaloriedagbog", body: "", url: "./", tag: "kaloriedagbog" };
  try {
    if (e.data) d = Object.assign(d, e.data.json());
  } catch (fejl) {
    try { d.body = e.data.text(); } catch (f2) {}
  }
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      tag: d.tag,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      data: { url: d.url },
      renotify: false
    })
  );
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var maal = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (vinduer) {
      for (var i = 0; i < vinduer.length; i++) {
        if (vinduer[i].url.indexOf(self.location.origin) === 0 && "focus" in vinduer[i]) {
          return vinduer[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(maal);
    })
  );
});
