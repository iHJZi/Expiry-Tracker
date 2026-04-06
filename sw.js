const CACHE_VERSION = "v2";
const HTML_CACHE_NAME = `expiry-tracker-html-${CACHE_VERSION}`;
const ASSET_CACHE_NAME = `expiry-tracker-assets-${CACHE_VERSION}`;
const HTML_SHELL = [
  "./",
  "./index.html",
];
const STATIC_ASSETS = [
  "./styles.css",
  "./manifest.webmanifest",
  "./src/app.js",
  "./src/storage.js",
  "./src/utils.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];
const OFFLINE_DOCUMENT = "./index.html";

function isSameOriginRequest(request) {
  const requestUrl = new URL(request.url);
  return requestUrl.origin === self.location.origin;
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.destination === "document";
}

function shouldCache(response) {
  return Boolean(response && response.ok && response.type === "basic");
}

async function precacheResources(cacheName, resources) {
  const cache = await caches.open(cacheName);
  await cache.addAll(resources);
}

async function networkFirst(request) {
  const cache = await caches.open(HTML_CACHE_NAME);

  try {
    const response = await fetch(request);

    if (shouldCache(response)) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    const offlineResponse = await cache.match(OFFLINE_DOCUMENT);

    if (offlineResponse) {
      return offlineResponse;
    }

    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const networkResponsePromise = fetch(request)
    .then((networkResponse) => {
      if (shouldCache(networkResponse)) {
        cache.put(request, networkResponse.clone());
      }

      return networkResponse;
    })
    .catch(() => null);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await networkResponsePromise;

  if (networkResponse) {
    return networkResponse;
  }

  throw new Error("Offline");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      precacheResources(HTML_CACHE_NAME, HTML_SHELL),
      precacheResources(ASSET_CACHE_NAME, STATIC_ASSETS),
    ]),
  );
});

self.addEventListener("activate", (event) => {
  const validCacheNames = new Set([HTML_CACHE_NAME, ASSET_CACHE_NAME]);

  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !validCacheNames.has(key))
          .map((key) => caches.delete(key)),
      ),
    ),
  );

  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || !isSameOriginRequest(request)) {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    staleWhileRevalidate(request).catch(() =>
      new Response("", { status: 504, statusText: "Offline" }),
    ),
  );
});
