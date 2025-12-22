// functions/api/chat.js

export async function onRequest(context) {
  const { request, env } = context;

  // Optional: make GET show a friendly message (prevents the "unstyled homepage" confusion)
  if (request.method === "GET") {
    return new Response(
      "WorldLeaders Chat API. Send a POST with JSON: {\"message\":\"...\"}",
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'message' string" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (!env.OPENAI_VECTOR_STORE_ID) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_VECTOR_STORE_ID" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    // Call OpenAI Responses API
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "You are the WorldLeaders assistant for parents and educators. Be warm, concise, practical. If unsure, ask a clarifying question.",
          },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "file_search",
            vector_store_ids: [env.OPENAI_VECTOR_STORE_ID],
            max_num_results: 5,
          },
        ],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: data?.error?.message || "OpenAI error",
          details: data,
        }),
        {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );
    }

    // Extract the assistant text from the Responses API result
    const outputText =
      (data.output || [])
        .flatMap((item) => item.content || [])
        .filter((c) => c.type === "output_text")
        .map((c) => c.text)
        .join("\n\n") || "Sorry — I couldn’t generate a response.";

    // Basic CORS (so your website JS can call /api/chat)
    return new Response(JSON.stringify({ answer: outputText, raw: data }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

// Handle OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
    },
  });
}
