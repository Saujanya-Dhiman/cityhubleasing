import { cors, json } from "./lib/config.mjs";
import { allow } from "./lib/rate-limit.mjs";
import { searchProperties } from "./lib/property-search.mjs";

export default async (request) => {
  const headers = cors(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);
  if (!allow(request).allowed) return json({ error: "Too many requests." }, 429, headers);

  try {
    const body = await request.json();
    const state = body.state || {};
    const excludeIds = body.excludeIds || state.excludeIds || [];
    const results = (await searchProperties(state, { excludeIds, count: 2, question: body.question || "" })).slice(0, 2);
    return json({ properties: results }, 200, headers);
  } catch (error) {
    console.error("CityHub property search error", error.message);
    return json({ error: "Search failed" }, 500, headers);
  }
};
