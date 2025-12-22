export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    const body = await request.json().catch(() => ({}));
    const userMessage = (body?.message || "").toString().trim();
    if (!userMessage) return json({ error: "Missing message" }, 400);

    const OPENAI_API_KEY = env.OPENAI_API_KEY;
    const VECTOR_STORE_ID = env.OPENAI_VECTOR_STORE_ID;
    const model = env.OPENAI_MODEL || "gpt-4.1-mini";

    if (!OPENAI_API_KEY) return json({ error: "Missing OPENAI_API_KEY" }, 500);
    if (!VECTOR_STORE_ID) return json({ error: "Missing OPENAI_VECTOR_STORE_ID" }, 500);

    const system = [
      "You are the WorldLeaders Assistant for parents and educators.",
      "Be calm, supportive, and practical. Use short paragraphs and bullets when helpful.",
      "Educational content only. Not medical advice. Do not diagnose or prescribe.",
      "If asked for medical advice: encourage consulting qualified professionals.",
      "If user mentions self-harm, abuse, or immediate danger: advise contacting local emergency services or trusted local resources.",
      "Use file_search to ground answers in the provided WorldLeaders documents.",
    ].join("\n");

    // ✅ Responses API payload (this is the key change)
    const payload = {
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
      tools: [{ type: "file_search" }],
      tool_resources: {
        file_search: {
          vector_store_ids: [VECTOR_STORE_ID],
        },
      },
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      // Surface the OpenAI error to you (helps debugging)
      return json(
        { error: data?.error?.message || `OpenAI error (${resp.status})` },
        500
      );
    }

    const answer = extractAnswerText(data);
    return json({ answer: answer || "Sorry — I couldn’t generate a response." }, 200);
  } catch (e) {
    return json({ error: "Server error" }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Handles Responses API output shapes safely
function extractAnswerText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const out = data?.output;
  if (Array.isArray(out)) {
    let text = "";
    for (const item of out) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string") text += c.text;
        if (c?.type === "text" && typeof c?.text === "string") text += c.text;
      }
    }
    return text.trim();
  }

  return "";
}
