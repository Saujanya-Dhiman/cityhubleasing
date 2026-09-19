import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import admin from "firebase-admin";

const root = process.cwd();
const siteUrl = (process.env.SITE_URL || "https://cityhubleasing.netlify.app").replace(/\/$/, "");
const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const excluded = new Set(["admin.html", "adminLogin.html", "google555cd312e2847d41.html", "search.html"]);
const clean = value => String(value || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const hash = value => createHash("sha256").update(value).digest("hex");
const chunk = (text, size = 950, overlap = 140) => {
  const words = text.split(" "); const output = [];
  for (let i = 0; i < words.length; i += size - overlap) output.push(words.slice(i, i + size).join(" "));
  return output.filter(part => part.length > 120);
};

async function staticSources() {
  const files = (await readdir(root)).filter(file => file.endsWith(".html") && !excluded.has(file));
  const sources = [];
  for (const file of files) {
    const html = await readFile(path.join(root, file), "utf8");
    const title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ["", file])[1]);
    const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || [])[1];
    const body = (html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) || html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || ["", ""])[1];
    const url = canonical || `${siteUrl}/${file === "index.html" ? "" : file}`;
    chunk(clean(body)).forEach((text, index) => sources.push({ id: hash(`${url}:${index}:${text}`), title, url, text, type: "page", sourceHash: hash(text) }));
  }
  return sources;
}

async function listingSources(database) {
  const snapshot = await database.collection("listings").get();
  return snapshot.docs.flatMap(document => {
    const item = document.data();
    const text = clean([item.title, item.category, item.location, item.description, item.price, item.amenities].filter(Boolean).join(". "));
    return text ? [{ id: hash(`listing:${document.id}:${text}`), title: item.title || "CityHub Leasing property", url: `${siteUrl}/${item.category === "Warehouse" ? "warehouse-for-rent.html" : item.category === "Showroom" ? "showroom-for-rent.html" : "office-space-mohali.html"}`, text, type: "listing", listingId: document.id, sourceHash: hash(text) }] : [];
  });
}

async function embeddings(inputs) {
  const key = process.env.OPENAI_API_KEY || "";
  const configuredBase = (process.env.OPENAI_BASE_URL || "").replace(/\/$/, "");
  const usesOpenRouter = Boolean(configuredBase.includes("openrouter.ai") || key.startsWith("sk-or-") || /openrouter/i.test(process.env.CHAT_PROVIDER || ""));
  const embeddingsEnabled = process.env.OPENAI_EMBEDDINGS_ENABLED === "true" || (!usesOpenRouter && Boolean(key));
  if (!embeddingsEnabled) {
    console.log("Skipping embeddings (OpenRouter/lexical mode). Set OPENAI_EMBEDDINGS_ENABLED=true to force them.");
    return [];
  }
  const embeddingUrl = `${(configuredBase || (usesOpenRouter ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1")).replace(/\/$/, "")}/embeddings`;
  const response = await fetch(embeddingUrl, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model: embeddingModel, input: inputs }) });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Embeddings request failed: ${response.status} ${raw.slice(0, 200)}`);
  const data = JSON.parse(raw);
  return (data.data || []).map(item => item.embedding);
}

const pages = await staticSources();
await mkdir(path.join(root, "data"), { recursive: true });
await writeFile(path.join(root, "data", "knowledge-manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), sources: pages.map(({ embedding, ...source }) => source) }, null, 2));
console.log(`Prepared ${pages.length} website content chunks.`);

if (!process.env.OPENAI_API_KEY || !process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log("Skipping Firestore embedding sync: OPENAI_API_KEY and FIREBASE_SERVICE_ACCOUNT are required in the deployment environment.");
  process.exit(0);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const database = admin.firestore();
const sources = [...pages, ...(await listingSources(database))];
let vectors = [];
try {
  for (let index = 0; index < sources.length; index += 50) {
    vectors.push(...(await embeddings(sources.slice(index, index + 50).map(source => source.text))));
  }
} catch (error) {
  console.error("Embeddings unavailable; syncing lexical chunks only.", error.message);
  vectors = [];
}
const existing = await database.collection("knowledge_chunks").get();
const batch = database.batch();
existing.docs.forEach(document => batch.delete(document.ref));
sources.forEach((source, index) => {
  const payload = { ...source, updatedAt: new Date().toISOString() };
  if (Array.isArray(vectors[index])) payload.embedding = vectors[index];
  batch.set(database.collection("knowledge_chunks").doc(source.id), payload);
});
await batch.commit();
console.log(`Synced ${sources.length} grounded knowledge chunks to Firestore${vectors.length ? " with embeddings" : " (lexical only)"}.`);
