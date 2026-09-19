import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tryDb } from "./firebase.mjs";
import { adminNotifyWebhookUrl } from "./config.mjs";

const storeFile = join(dirname(fileURLToPath(import.meta.url)), "../../../data/local-leads.json");

async function readLocal() {
  try {
    return JSON.parse(await readFile(storeFile, "utf8"));
  } catch {
    return { leads: {} };
  }
}

async function writeLocal(data) {
  await mkdir(dirname(storeFile), { recursive: true });
  await writeFile(storeFile, JSON.stringify(data, null, 2), "utf8");
}

export function leadId(sessionId) {
  return String(sessionId || "").trim() || `lead_${Date.now()}`;
}

export function publicLeadId() {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CH-${stamp}-${rand}`;
}

export async function saveCommercialLead(lead) {
  const cleanPhone = String(lead.phone || "").replace(/\D/g, "").slice(-10);
  const now = new Date().toISOString();
  const local = await readLocal();
  if (!local.commercial) local.commercial = {};

  // Check if an existing record has this phone number
  let existingKey = null;
  if (cleanPhone && cleanPhone.length === 10) {
    for (const [k, v] of Object.entries(local.commercial || {})) {
      const p = String(v.phone || "").replace(/\D/g, "").slice(-10);
      if (p === cleanPhone) {
        existingKey = k;
        break;
      }
    }
  }

  const publicId = existingKey || String(lead.publicId || lead.leadId || "").trim() || publicLeadId();
  const previous = (existingKey && local.commercial[existingKey]) || {};

  const record = {
    ...previous,
    ...lead,
    phone: cleanPhone || lead.phone,
    id: publicId,
    publicId,
    leadId: publicId,
    createdAt: previous.createdAt || lead.createdAt || now,
    updatedAt: now,
    status: lead.status || previous.status || "new",
    collection: "commercial_leads"
  };

  local.commercial[publicId] = record;
  await writeLocal(local);

  const database = tryDb();
  if (database) {
    try {
      await database.collection("commercial_leads").doc(publicId).set(record, { merge: true });
    } catch (error) {
      console.error("Firestore commercial_leads save failed:", error.message);
      console.info("COMMERCIAL_LEAD_FALLBACK", JSON.stringify(record));
    }
  } else {
    console.info("COMMERCIAL_LEAD", JSON.stringify(record));
  }

  return record;
}

function compactLead(patch = {}) {
  const sqft = patch.sqft || patch.requiredArea || "";
  const moveIn = patch.moveIn || patch.moveInDate || patch.timeline || "";
  const rejected = patch.rejectedProperties || patch.rejectedPropertyIds || [];
  const transcript = patch.fullTranscript || patch.transcript || patch.history;
  const next = {
    ...patch,
    name: patch.name || "",
    phone: patch.phone || "",
    email: patch.email || "",
    company: patch.company || "",
    category: patch.category || patch.officeType || "",
    location: patch.location || "",
    teamSize: patch.teamSize || "",
    budget: patch.budget || "",
    sqft,
    requiredArea: patch.requiredArea || sqft,
    moveIn,
    likedProperty: patch.likedProperty || null,
    rejectedProperties: Array.isArray(rejected) ? rejected : [],
    sessionId: patch.sessionId || ""
  };
  if (Array.isArray(transcript) && transcript.length) {
    next.fullTranscript = transcript;
    next.transcript = transcript;
  }
  return next;
}

export async function upsertLead(id, patch) {
  const key = leadId(id);
  const now = new Date().toISOString();
  const incoming = compactLead({
    ...patch,
    id: key,
    sessionId: patch.sessionId || key,
    updatedAt: now,
    createdAt: patch.createdAt || now,
    status: patch.status || "new"
  });

  const local = await readLocal();
  const previous = local.leads[key] || {};
  const merged = {
    ...previous,
    ...incoming,
    createdAt: previous.createdAt || incoming.createdAt,
    notified: previous.notified || false,
    updatedAt: now
  };
  if (!Array.isArray(incoming.fullTranscript) || !incoming.fullTranscript.length) {
    merged.fullTranscript = previous.fullTranscript || previous.transcript || [];
    merged.transcript = merged.fullTranscript;
  }
  local.leads[key] = merged;
  await writeLocal(local);

  const database = tryDb();
  if (database) {
    const { id: _omit, ...doc } = merged;
    database.collection("chat_leads").doc(key).set(doc, { merge: true }).catch(error => {
      console.error("Firestore lead save failed:", error.message);
    });
  }

  return { lead: merged, isNew: !previous.createdAt };
}

export async function listLeads() {
  const local = await readLocal();
  const byId = { ...local.leads, ...(local.commercial || {}) };
  const database = tryDb();
  if (database) {
    try {
      const snaps = await Promise.all([
        database.collection("chat_leads").get(),
        database.collection("commercial_leads").get()
      ]);
      snaps.forEach((snap) => {
        snap.forEach((docSnap) => {
          byId[docSnap.id] = { id: docSnap.id, ...docSnap.data(), ...byId[docSnap.id] };
        });
      });
    } catch (error) {
      console.error("Firestore list leads failed:", error.message);
    }
  }

  // Deduplicate by normalized 10-digit Phone Number (or unique ID if no phone)
  const phoneMap = new Map();
  const rawList = Object.values(byId).sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));

  for (const item of rawList) {
    const rawPhone = String(item.phone || "").replace(/\D/g, "").slice(-10);
    const primaryKey = rawPhone && rawPhone.length === 10 ? `phone_${rawPhone}` : (item.publicId || item.leadId || item.id || item.sessionId);
    if (!primaryKey) continue;

    if (!phoneMap.has(primaryKey)) {
      phoneMap.set(primaryKey, item);
    } else {
      // Merge duplicate records with the same phone number (preserve earliest createdAt, latest details)
      const prev = phoneMap.get(primaryKey);
      const earliestCreated = [prev.createdAt, item.createdAt].filter(Boolean).sort()[0];
      phoneMap.set(primaryKey, {
        ...item,
        ...prev,
        name: prev.name || item.name,
        company: prev.company || item.company,
        category: prev.category || item.category || prev.officeType || item.officeType,
        officeType: prev.officeType || item.officeType || prev.category || item.category,
        createdAt: earliestCreated || prev.createdAt || item.createdAt
      });
    }
  }

  const uniqueLeads = Array.from(phoneMap.values());
  return uniqueLeads.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

export async function updateLeadStatus(id, status) {
  const key = String(id || "").trim();
  const res = await upsertLead(key, { status });
  const local = await readLocal();
  if (local.commercial && local.commercial[key]) {
    local.commercial[key].status = status;
    local.commercial[key].updatedAt = new Date().toISOString();
    await writeLocal(local);
  }
  return res;
}

export async function deleteLeadRecord(id) {
  const key = String(id || "").trim();
  if (!key) return;

  const local = await readLocal();
  let changed = false;
  let targetPhone = "";

  if (local.commercial && local.commercial[key]) {
    targetPhone = String(local.commercial[key].phone || "").replace(/\D/g, "").slice(-10);
  } else if (local.leads && local.leads[key]) {
    targetPhone = String(local.leads[key].phone || "").replace(/\D/g, "").slice(-10);
  }

  const keysToDelete = new Set([key]);

  for (const k of Object.keys(local.commercial || {})) {
    const item = local.commercial[k];
    const p = String(item?.phone || "").replace(/\D/g, "").slice(-10);
    if (item && (item.publicId === key || item.id === key || item.sessionId === key || item.leadId === key || (targetPhone && p === targetPhone))) {
      keysToDelete.add(k);
      delete local.commercial[k];
      changed = true;
    }
  }
  for (const k of Object.keys(local.leads || {})) {
    const item = local.leads[k];
    const p = String(item?.phone || "").replace(/\D/g, "").slice(-10);
    if (item && (item.publicId === key || item.id === key || item.sessionId === key || item.leadId === key || (targetPhone && p === targetPhone))) {
      keysToDelete.add(k);
      delete local.leads[k];
      changed = true;
    }
  }

  if (changed) {
    await writeLocal(local);
  }

  const database = tryDb();
  if (database) {
    try {
      const deletePromises = [];
      for (const k of keysToDelete) {
        deletePromises.push(database.collection("chat_leads").doc(k).delete());
        deletePromises.push(database.collection("commercial_leads").doc(k).delete());
      }
      await Promise.allSettled(deletePromises);
    } catch (error) {
      console.error("Firestore delete lead error:", error.message);
    }
  }
}

export const WHATSAPP_NUMBER = "917696510579";

export function formatLeadMessage(lead) {
  const summary = [
    lead.officeType || "commercial space",
    lead.location ? `in ${lead.location}` : "",
    lead.teamSize || lead.requiredArea ? `for ${lead.teamSize || lead.requiredArea}` : ""
  ].filter(Boolean).join(" ");
  const extras = [
    lead.budget ? `Budget: ${lead.budget}` : "",
    lead.timeline || lead.moveInDate ? `Timeline: ${lead.timeline || lead.moveInDate}` : "",
    lead.propertyTitle ? `Property: ${lead.propertyTitle}` : "",
    lead.propertyId ? `Property ID: ${lead.propertyId}` : "",
    lead.visitDate && lead.timeSlot ? `Walkthrough: ${lead.visitDate} ${lead.timeSlot}` : "",
    lead.requirement && lead.source === "walkthrough" ? lead.requirement : "",
  ].filter(Boolean);
  const requirement = [summary, ...extras].filter(Boolean).join(". ");

  const liked = lead.likedProperty || {};
  const likedTitle = lead.likedPropertyTitle || liked.title;
  const likedLoc = lead.likedPropertyLocation || liked.location;
  const likedPrice = lead.likedPropertyPrice || liked.price;
  const likedImage = lead.likedPropertyImage || liked.imageUrl;
  const likedLines = likedTitle
    ? [
        `*Liked Property:* ${likedTitle}${likedLoc ? ` (${likedLoc})` : ""}`,
        likedPrice ? `*Price:* ${likedPrice}` : "",
        likedImage ? `*Image:* ${likedImage}` : ""
      ].filter(Boolean)
    : [];

  return [
    "*New Inquiry from CityHub Leasing Website*",
    "",
    `*Name:* ${lead.name || "—"}`,
    `*Email:* ${lead.email || "—"}`,
    `*Phone:* ${String(lead.phone || "").replace(/\D/g, "") || "—"}`,
    `*Message:* ${requirement || lead.requirement || "AI website enquiry"}`,
    ...likedLines
  ].join("\n");
}

export function whatsappEnquiryUrl(lead) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(formatLeadMessage(lead))}`;
}

export async function notifyNewLead(lead) {
  if (lead.notified) return { skipped: true, text: formatLeadMessage(lead) };
  const text = formatLeadMessage(lead);
  const payload = { event: "new_lead", source: lead.source || "website", lead, text };
  if (adminNotifyWebhookUrl) {
    await fetch(adminNotifyWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(error => console.error("Lead webhook failed:", error.message));
  }
  const local = await readLocal();
  if (local.leads[lead.id]) {
    local.leads[lead.id].notified = true;
    local.leads[lead.id].notifyText = text;
    await writeLocal(local);
  }
  return { skipped: false, text };
}
