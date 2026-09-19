import { readFile } from "node:fs/promises";
import { tryDb } from "./firebase.mjs";
import { canonicalCategory } from "./lead-flow.mjs";

const MICRO_MARKETS = [
  { re: /phase\s*8\s*b|phase\s*8b/i, location: "Phase 8B, Mohali", city: "Mohali" },
  { re: /sector\s*74/i, location: "Sector 74, Mohali", city: "Mohali" },
  { re: /sector\s*82/i, location: "Sector 82, Mohali", city: "Mohali" },
  { re: /industrial area\s*(phase|ph\.?)\s*2|\bind\s*area\s*(ph\.?\s*)?2\b/i, location: "Industrial Area Phase 2, Chandigarh", city: "Chandigarh" },
  { re: /industrial area\s*(phase|ph\.?)\s*1|\bind\s*area\s*(ph\.?\s*)?1\b/i, location: "Industrial Area Phase 1, Chandigarh", city: "Chandigarh" },
  { re: /\bit park\b|rgctp|technology park/i, location: "IT Park, Chandigarh", city: "Chandigarh" },
  { re: /\bmohali\b/i, location: "Mohali", city: "Mohali" },
  { re: /\bchandigarh\b/i, location: "Chandigarh", city: "Chandigarh" }
];

export const FALLBACK_LISTINGS = [
  { id: "mohali-corporate", title: "Premium Corporate Setup", location: "Phase 8B, Mohali", price: "On request", size: "20–40 seats", category: "Office", officeType: "Private Office", imageUrl: "/noffice1.jpg", summary: "Plug & play corporate suite", city: "Mohali", microMarket: "Phase 8B" }
];

let staticCache = { expires: 0, listings: null };

function clean(value) {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

function formatInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 100000) {
    const lakhs = n / 100000;
    return `₹${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}L / month`;
  }
  return `₹${n.toLocaleString("en-IN")} / month`;
}

export function formatProperty(p) {
  const imageUrl = p.imageUrl || (Array.isArray(p.images) && p.images[0]) || null;
  const sqft = p.sqft || p.coveredArea || p.groundFloorSqft || null;
  const desks = p.desks || p.dedicatedDesks || null;
  const cabins = p.cabins || p.privateCabins || null;
  const uniqueSize = clean(p.size) || [
    sqft ? `${Number(sqft).toLocaleString("en-IN")} sq ft` : "",
    desks ? `${desks} desks` : "",
    cabins ? `${cabins} cabins` : ""
  ].filter(Boolean).join(" · ");
  const rentMonthly = Number(p.rentMonthly) || 0;
  const perSeatPrice = Number(p.perSeatPrice) || 0;
  const rentPerSqft = Number(p.rentPerSqft) || 0;
  const price = clean(
    p.price ||
    (perSeatPrice ? `₹${perSeatPrice.toLocaleString("en-IN")} / seat / month` : "") ||
    (rentPerSqft ? `₹${rentPerSqft} / sq ft / month` : "") ||
    formatInr(rentMonthly) ||
    p.budget ||
    "Price on request"
  );

  return {
    id: p.id,
    title: clean(p.title || "Premium Commercial Space"),
    type: clean(p.type || p.officeType || p.category || ""),
    location: clean(p.location || "Mohali / Chandigarh"),
    city: clean(p.city || ""),
    microMarket: clean(p.microMarket || ""),
    price,
    size: uniqueSize,
    furnishing: clean(p.furnishing || ""),
    category: clean(p.category || p.officeType || ""),
    officeType: clean(p.officeType || p.category || ""),
    imageUrl,
    sqft: sqft ? Number(sqft) : null,
    desks: desks ? Number(desks) : null,
    cabins: cabins ? Number(cabins) : null,
    rentMonthly: rentMonthly || null,
    perSeatPrice: perSeatPrice || null,
    rentPerSqft: rentPerSqft || null,
    coveredArea: p.coveredArea ? Number(p.coveredArea) : null,
    dockHeight: clean(p.dockHeight || ""),
    industrialPower: clean(p.industrialPower || ""),
    frontage: clean(p.frontage || ""),
    groundFloorSqft: p.groundFloorSqft ? Number(p.groundFloorSqft) : null,
    highFootfall: Boolean(p.highFootfall),
    dedicatedDesks: p.dedicatedDesks ? Number(p.dedicatedDesks) : null,
    privateCabins: p.privateCabins ? Number(p.privateCabins) : null,
    summary: clean(
      p.summary ||
      [p.furnishing, p.category, p.readyToMove ? "Ready to Move-in" : null].filter(Boolean).join(" • ")
    )
  };
}

export function parseBudgetRange(budgetText = "") {
  const raw = String(budgetText || "").toLowerCase().replace(/,/g, "");
  if (!raw || /not sure/.test(raw)) return { min: 0, max: Infinity };
  const toInr = (n, unit) => {
    const num = Number(String(n).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(num)) return 0;
    const u = String(unit || "").toLowerCase();
    if (/^cr/.test(u)) return num * 10000000;
    if (/^l/.test(u)) return num * 100000;
    if (/^k/.test(u) || /thousand/.test(u)) return num * 1000;
    return num;
  };

  const range = raw.match(/([\d.]+)\s*(k|lakh|lakhs|l|thousand|cr)?\s*[–\-to]+\s*₹?\s*([\d.]+)\s*(k|lakh|lakhs|l|thousand|cr)?/i);
  if (range) {
    return { min: toInr(range[1], range[2] || range[4]), max: toInr(range[3], range[4] || range[2]) };
  }
  const under = raw.match(/(?:under|upto|up to|below)\s*₹?\s*([\d.]+)\s*(k|lakh|lakhs|l|thousand|cr)?/i);
  if (under) return { min: 0, max: toInr(under[1], under[2]) };
  const plus = raw.match(/([\d.]+)\s*(k|lakh|lakhs|l|thousand|cr)?\s*\+/i);
  if (plus) return { min: toInr(plus[1], plus[2]), max: Infinity };
  const single = raw.match(/([\d.]+)\s*(k|lakh|lakhs|l|thousand|cr)?/);
  if (single && (single[2] || Number(single[1]) >= 1000)) {
    const value = toInr(single[1], single[2]);
    return { min: Math.round(value * 0.7), max: Math.round(value * 1.25) };
  }
  return { min: 0, max: Infinity };
}

export function parsePropertyQuery(question = "", state = {}) {
  const next = { ...state };
  const raw = String(question || "");
  const lower = raw.toLowerCase();

  if (/\b(coworking|co-working|shared desk|hot desk|dedicated desk)\b/.test(lower)) {
    next.officeType = "Coworking";
    next.category = "Coworking";
  } else if (/\b(warehouse|godown|logistics shed)\b/.test(lower)) {
    next.officeType = "Warehouse";
    next.category = "Warehouse";
  } else if (/\b(showroom|retail shop)\b/.test(lower)) {
    next.officeType = "Showroom";
    next.category = "Showroom";
  } else if (/\b(private office|office space|bareshell|bare-shell|furnished office)\b/.test(lower) || /^office( space)?$/i.test(raw.trim())) {
    next.officeType = "Private Office";
    next.category = "Office";
  }
  if (next.officeType) next.category = canonicalCategory(next) || next.category;

  for (const market of MICRO_MARKETS) {
    if (market.re.test(raw)) {
      next.location = market.location;
      next.city = market.city;
      next.microMarket = market.location;
      break;
    }
  }

  const budgetHint =
    raw.match(/(?:budget|rent|price)\s*(?:is|of)?\s*(?:around|under|upto|about)?\s*([\d.,]+)\s*(lakh|lakhs|l|k|thousand|cr)?/i) ||
    raw.match(/\b(?:around|under|upto|about)\s*([\d.,]+)\s*(lakh|lakhs|l|k|thousand|cr)\b/i);
  if (budgetHint) next.budget = budgetHint[0].trim();

  const areaMatch = raw.match(/\b(\d{2,6})\s*(sq\.?\s*ft|sqft|sft)\b/i);
  if (areaMatch) {
    next.requiredArea = areaMatch[0].replace(/\s+/g, " ");
    next.sqft = next.requiredArea;
  }

  const teamMatch = raw.match(/\b(\d+)\s*\+?\s*(seats|people|persons|desks|employees)\b/i);
  if (teamMatch) next.teamSize = `${teamMatch[1]} people`;

  const companyMatch = raw.match(/(?:company|business|firm)(?:\s+name)?(?:\s+is)?\s+([A-Za-z0-9][A-Za-z0-9\s&.-]{1,40})/i);
  if (companyMatch && companyMatch[1].trim().split(/\s+/).length <= 5) {
    next.company = companyMatch[1].trim();
  }

  const range = parseBudgetRange(next.budget || "");
  next.budgetMin = range.min;
  next.budgetMax = range.max;
  return next;
}

export function getRandomPairs(pool, excludeIds = [], count = 2) {
  const cap = Math.min(Math.max(Number(count) || 2, 1), 6);
  const excluded = new Set((excludeIds || []).map(String));
  const fresh = pool.filter(item => !excluded.has(String(item.id)));
  if (!fresh.length) return [];
  return fresh.slice(0, Math.min(cap, fresh.length));
}

export function listingCanonicalCategory(p = {}) {
  const ot = String(p.officeType || p.type || p.category || "").toLowerCase();
  if (/warehouse|godown|industrial/.test(ot)) return "Warehouse";
  if (/showroom|retail/.test(ot)) return "Showroom";
  if (/cowork/.test(ot)) return "Coworking";
  if (/office|cabin|suite|meeting/.test(ot)) return "Office";
  const blob = `${p.category || ""} ${p.title || ""}`.toLowerCase();
  if (/warehouse|godown/.test(blob)) return "Warehouse";
  if (/showroom|retail/.test(blob)) return "Showroom";
  if (/cowork/.test(blob)) return "Coworking";
  if (/office/.test(blob)) return "Office";
  return "";
}

function listingComparableRent(p, state = {}) {
  const teamNum = parseInt(String(state.teamSize || "").replace(/\D/g, ""), 10) || 0;
  const sqftNum = parseInt(String(state.requiredArea || state.sqft || "").replace(/\D/g, ""), 10) || Number(p.sqft) || 0;
  if (listingCanonicalCategory(p) === "Coworking" && Number(p.perSeatPrice)) {
    return Number(p.perSeatPrice) * (teamNum || 1);
  }
  if (listingCanonicalCategory(p) === "Warehouse" && Number(p.rentPerSqft) && sqftNum) {
    return Number(p.rentPerSqft) * sqftNum;
  }
  if (Number(p.rentMonthly)) return Number(p.rentMonthly);
  return 0;
}

function locationBlob(p) {
  return `${p.location || ""} ${p.city || ""} ${p.microMarket || ""}`.toLowerCase();
}

function locationKey(text = "") {
  const t = String(text || "").toLowerCase();
  if (/phase\s*8\s*b|phase\s*8b/.test(t)) return "phase 8b";
  if (/sector\s*74/.test(t)) return "sector 74";
  if (/sector\s*82/.test(t)) return "sector 82";
  if (/industrial area\s*(phase|ph\.?)\s*2|\bind area\s*(ph\.?\s*)?2\b/.test(t)) return "industrial area phase 2";
  if (/industrial area\s*(phase|ph\.?)\s*1|\bind area\s*(ph\.?\s*)?1\b/.test(t)) return "industrial area phase 1";
  if (/\bit park\b|rgctp|technology park/.test(t)) return "it park";
  if (/\bmohali\b/.test(t) && !/\bchandigarh\b/.test(t)) return "mohali";
  if (/\bchandigarh\b/.test(t) && !/\bmohali\b/.test(t)) return "chandigarh";
  return t.replace(/\s+/g, " ").trim();
}

function locationMatches(p, location) {
  const want = String(location || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!want) return false;
  const blob = locationBlob(p);
  if (blob.includes(want)) return true;
  const wantKey = locationKey(want);
  if (wantKey && blob.includes(wantKey)) return true;
  if (wantKey && locationKey(blob) === wantKey) return true;
  const micro = String(p.microMarket || "").toLowerCase();
  if (micro && want.includes(micro)) return true;
  return false;
}

export function scoreListing(p, state = {}) {
  let score = 0;
  const want = canonicalCategory(state);
  const got = listingCanonicalCategory(p);
  if (want && got === want) score += 40;
  else if (want && got && got !== want) return -1;

  if (state.location) {
    if (locationMatches(p, state.location)) score += 30;
    else if (state.city && locationMatches(p, state.city)) score += 12;
  }

  if (state.teamSize) {
    const teamNum = parseInt(String(state.teamSize).replace(/\D/g, ""), 10);
    const capacity = Number(p.desks) || Number(p.dedicatedDesks) || 0;
    if (teamNum && capacity) {
      if (capacity >= teamNum && capacity <= teamNum * 1.6) score += 18;
      else if (Math.abs(capacity - teamNum) <= 8) score += 10;
    }
  }

  if (state.requiredArea || state.sqft) {
    const need = parseInt(String(state.requiredArea || state.sqft).replace(/\D/g, ""), 10);
    const have = Number(p.sqft) || Number(p.coveredArea) || Number(p.groundFloorSqft) || 0;
    if (need && have) {
      const ratio = have / need;
      if (ratio >= 0.8 && ratio <= 1.4) score += 16;
      else if (ratio >= 0.6 && ratio <= 1.8) score += 8;
    }
  }

  const range = parseBudgetRange(state.budget || "");
  const rent = listingComparableRent(p, state);
  if (rent && Number.isFinite(range.max) && range.max < Infinity) {
    if (rent <= range.max * 1.1 && rent >= (range.min || 0) * 0.7) score += 20;
    else if (rent > range.max * 1.35) return -1;
  } else if (state.budget && /not sure/i.test(String(state.budget))) {
    score += 8;
  }

  if (state.furnishing && p.furnishing) {
    if (String(p.furnishing).toLowerCase().includes(String(state.furnishing).toLowerCase())) score += 8;
  }

  return score;
}

export function filterAndRankPool(properties, state = {}) {
  const want = canonicalCategory(state);
  let pool = properties;

  if (want) {
    pool = properties.filter(p => listingCanonicalCategory(p) === want);
    if (!pool.length) return [];
  }

  if (state.location) {
    const locMatches = pool.filter(p => locationMatches(p, state.location));
    if (locMatches.length) pool = locMatches;
    else if (state.city) {
      const cityMatches = pool.filter(p => locationMatches(p, state.city));
      if (cityMatches.length) pool = cityMatches;
    }
  }

  const scored = pool
    .map(p => ({ property: p, score: scoreListing(p, state) }))
    .filter(item => item.score >= 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map(item => item.property);
}

async function loadStaticListings() {
  if (staticCache.listings && staticCache.expires > Date.now()) return staticCache.listings;
  try {
    const raw = await readFile(new URL("../../../data/properties.json", import.meta.url), "utf8");
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : data.properties || [];
    staticCache = { expires: Date.now() + 60_000, listings: list.map(formatProperty) };
    return staticCache.listings;
  } catch (error) {
    console.error("properties.json load failed", error.message);
    staticCache = { expires: Date.now() + 15_000, listings: FALLBACK_LISTINGS.map(formatProperty) };
    return staticCache.listings;
  }
}

async function loadListings() {
  const fallback = await loadStaticListings();
  try {
    const database = tryDb();
    if (!database) return fallback;
    const snapshot = await database.collection("listings").get();
    const live = snapshot.docs.map(doc => formatProperty({ id: doc.id, ...doc.data() }));
    return live.length ? [...live, ...fallback] : fallback;
  } catch (error) {
    console.error("Listing load error", error.message);
    return fallback;
  }
}

export async function searchProperties(state = {}, options = {}) {
  const queryState = parsePropertyQuery(options.question || "", state);
  try {
    const excludeIds = options.excludeIds || queryState.excludeIds || [];
    const count = Math.min(Math.max(Number(options.count) || 4, 1), 6);
    const pool = filterAndRankPool(await loadListings(), queryState);
    return getRandomPairs(pool, excludeIds, count);
  } catch (error) {
    console.error("Property search error", error);
    const pool = filterAndRankPool(await loadStaticListings(), queryState);
    return getRandomPairs(pool, options.excludeIds || [], Math.min(Number(options.count) || 4, 6));
  }
}

export function inventoryBrief(properties = []) {
  if (!properties.length) return "";
  return properties.map((p, i) => {
    const bits = [
      p.title,
      p.location,
      p.furnishing,
      p.size,
      p.price,
      p.dockHeight,
      p.industrialPower,
      p.frontage,
      p.highFootfall ? "high-footfall corridor" : "",
      p.summary
    ].filter(Boolean);
    return `${i + 1}. ${bits.join(" | ")}`;
  }).join("\n");
}
