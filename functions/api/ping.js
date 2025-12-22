export async function onRequestGet() {
  return new Response("pong", {
    headers: { "Content-Type": "text/plain" }
  });
}
