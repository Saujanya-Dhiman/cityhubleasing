import admin from "firebase-admin";
import { createHash } from "node:crypto";
import { db } from "./lib/firebase.mjs";
import { cors, embeddingModel, embeddingApiUrl, embeddingsEnabled, chatHeaders, isConfigured, json, parseProviderError, siteUrl } from "./lib/config.mjs";
import { clearKnowledgeCache, normalize } from "./lib/rag.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
async function embed(inputs) {
  if (!embeddingsEnabled) return [];
  const response = await fetch(embeddingApiUrl, {
    method: "POST",
    headers: chatHeaders(),
    body: JSON.stringify({ model: embeddingModel, input: inputs })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Embedding refresh failed: ${parseProviderError(raw, response.status)}`);
  const data = JSON.parse(raw);
  const vectors = data.data?.map(item => item.embedding) || [];
  if (!vectors.length) throw new Error("Embedding refresh failed: empty vectors");
  return vectors;
}

export default async request => {
  const headers = cors(request);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);
  if (!isConfigured()) return json({ error: "Knowledge service is not configured." }, 503, headers);
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const user = await admin.auth().verifyIdToken(token || "");
    const allowed = (process.env.ADMIN_EMAILS || "").split(",").map(email => email.trim()).filter(Boolean);
    if (!user.admin && (!allowed.length || !allowed.includes(user.email))) return json({ error: "Forbidden" }, 403, headers);
    const listingSnapshot = await db().collection("listings").get();
    const listings = listingSnapshot.docs.map(doc => {
      const value = doc.data();
      const text = normalize([value.title, value.category, value.location, value.description, value.price, value.amenities].filter(Boolean).join(". "));
      const category = String(value.category || "").toLowerCase();
      const page = category.includes("warehouse") ? "warehouse-for-rent.html" : category.includes("showroom") ? "showroom-for-rent.html" : category.includes("chandigarh") ? "office-space-chandigarh.html" : "office-space-mohali.html";
      const url = `${siteUrl}/${page}`;
      return { id: hash(`listing:${doc.id}:${text}`), title: value.title || "CityHub Leasing property", url, text, type: "listing", listingId: doc.id };
    }).filter(item => item.text);
    let vectors = [];
    try {
      vectors = listings.length ? await embed(listings.map(item => item.text)) : [];
    } catch (error) {
      console.error("Listing embeddings unavailable; saving lexical chunks", error.message);
    }
    const old = await db().collection("knowledge_chunks").where("type", "==", "listing").get();
    const batch = db().batch(); old.docs.forEach(doc => batch.delete(doc.ref));
    listings.forEach((item, index) => {
      const payload = { ...item, updatedAt: new Date().toISOString() };
      if (Array.isArray(vectors[index])) payload.embedding = vectors[index];
      batch.set(db().collection("knowledge_chunks").doc(item.id), payload);
    });
    await batch.commit(); clearKnowledgeCache();
    return json({ ok: true, count: listings.length, embeddings: vectors.length }, 200, headers);
  } catch (error) { console.error("Listing knowledge refresh failed", error.message); return json({ error: "Knowledge refresh failed." }, 500, headers); }
};
