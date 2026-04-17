self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("sports-card-scanner-shell"))
          .map((key) => caches.delete(key)),
      );

      await self.registration.unregister();

      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
      await Promise.all(
        clients.map((client) => {
          if ("navigate" in client) {
            return client.navigate(client.url);
          }

          return Promise.resolve();
        }),
      );
    })(),
  );
});
