// Respond only to the reminder-plan request during the offline review smoke
// test. There is deliberately no WebSocket upgrade or Automerge sync server.
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 8787,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/v1/notification-plans") {
      await request.arrayBuffer();
      return new Response(null, { status: 204 });
    }
    if (request.method === "GET" && url.pathname === "/_smoke") {
      return new Response("ready");
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Review smoke control stub listening on ${server.url}`);
