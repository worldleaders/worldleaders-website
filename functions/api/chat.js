export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json().catch(() => ({}));
    const userMessage = (body?.message || "").toString().trim();

    if (!userMessage) {
      return json({ error: "Missing message" }, 400);
    }

    // Required env vars (set in Cloudflare Pages project settings)
    const OPENAI_API_KEY = env.OPENAI_API_KEY;
    const VECTOR_STORE_ID = env.OPENAI_VECTOR_STORE_ID;

    if (!OPENAI_API_KEY) return json({ error: "Server not configured (missing OPENAI_API_KEY)" }, 500);
    if (!VECTOR_STORE_ID) return json({ error: "Server not configured (missing OPENAI_VECTOR_STORE_ID)" }, 500);

    const model = env.OPENAI_MODEL || "gpt-4.1-mini";

    // System guardrails: child-centered, educational, non-medical
    const system = [
      "You are the WorldLeaders Assistant for parents and educators.",
      "Be calm, supportive, and practical. Use short paragraphs and bullets when helpful.",
      "You MUST follow these safety rules:",
      "- Educational content only. Do not provide medical diagnosis or treatment.",
      "- If asked for diagnosis/medication/medical advice: encourage consulting qualified professionals.",
      "- If user mentions self-harm, abuse, or immediate danger: advise contacting local emergency services or trusted local resources.",
      "When you reference concepts that are covered in the WorldLeaders resources, prefer citing/using the provided files via file_search.",
      "If unsure, ask 1–2 clarifying questions."
    ].join("\n");

    const payload = {
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userMessage }
      ],
      // Enable RAG:
      tools: [{ type: "file_search" }],
      tool_resources: {
        file_search: {
          vector_store_ids: [VECTOR_STORE_ID]
        }
      }
      // You can optionally limit results:
      // , tool_choice: "auto"
      // , max_output_tokens: 500
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();

    if (!resp.ok) {
      return json({ error: data?.error?.message || "OpenAI error" }, 500);
    }

    // Extract text from the Responses API result
    const answer = extractAnswerText(data) || "Sorry — I couldn’t generate a response.";

    return json({ answer }, 200);
  } catch (e) {
    return json({ error: "Server error" }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// Robust extraction across Responses shapes
function extractAnswerText(data) {
  // Some Responses return output[].content[].text
  const out = data?.output;
  if (Array.isArray(out)) {
    let text = "";
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === "output_text" && typeof c?.text === "string") text += c.text;
          if (c?.type === "text" && typeof c?.text === "string") text += c.text;
        }
      }
    }
    if (text.trim()) return text.trim();
  }

  // Some SDK examples also return output_text directly
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  return "";
}
