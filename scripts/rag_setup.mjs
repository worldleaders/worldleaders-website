import fs from "node:fs";
import path from "node:path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("ERROR: Missing OPENAI_API_KEY in your environment.");
  console.error('Set it like: export OPENAI_API_KEY="sk-..."');
  process.exit(1);
}

const RAG_DIR = path.resolve("rag");

if (!fs.existsSync(RAG_DIR)) {
  console.error("ERROR: ./rag folder not found. Create it and add at least 1 file.");
  process.exit(1);
}

const files = fs
  .readdirSync(RAG_DIR)
  .filter((f) => /\.(pdf|txt|md|docx)$/i.test(f));

if (files.length === 0) {
  console.error("ERROR: No PDF/TXT/MD/DOCX files found in ./rag");
  process.exit(1);
}

async function openaiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  }
  return data;
}

async function createVectorStore(name) {
  return openaiFetch("https://api.openai.com/v1/vector_stores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

async function uploadFile(filepath, filename) {
  const form = new FormData();
  const blob = new Blob([fs.readFileSync(filepath)]);
  form.append("file", blob, filename);
  form.append("purpose", "assistants");

  return openaiFetch("https://api.openai.com/v1/files", {
    method: "POST",
    body: form,
  });
}

async function attachToVectorStore(vectorStoreId, fileId) {
  return openaiFetch(
    `https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    }
  );
}

(async () => {
  const vs = await createVectorStore("WorldLeaders Knowledge Base");
  console.log("\nOPENAI_VECTOR_STORE_ID:", vs.id);

  for (const f of files) {
    const full = path.join(RAG_DIR, f);
    console.log("\nUploading:", f);

    const uploaded = await uploadFile(full, f);
    console.log("  file_id:", uploaded.id);

    console.log("Attaching to vector store...");
    await attachToVectorStore(vs.id, uploaded.id);
    console.log("  attached:", f);
  }

  console.log("\nDone.");
  console.log("Now add this in Cloudflare Pages Secrets:");
  console.log("OPENAI_VECTOR_STORE_ID =", vs.id);
})().catch((e) => {
  console.error("\nRAG setup failed:", e.message);
  process.exit(1);
});
