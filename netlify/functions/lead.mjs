import { cors, json } from "./lib/config.mjs";
import {
  leadId,
  listLeads,
  notifyNewLead,
  publicLeadId,
  saveCommercialLead,
  updateLeadStatus,
  deleteLeadRecord,
  upsertLead,
  formatLeadMessage,
  whatsappEnquiryUrl
} from "./lib/lead-store.mjs";
import { validateContactDetails } from "./lib/lead-flow.mjs";

function leadFromBody(body = {}) {
  const sessionId = leadId(body.sessionId);
  return {
    name: String(body.name || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim(),
    company: String(body.company || body.businessName || "").trim(),
    officeType: String(body.officeType || "").trim(),
    location: String(body.location || "").trim(),
    teamSize: String(body.teamSize || "").trim(),
    requiredArea: String(body.requiredArea || body.sqft || "").trim(),
    sqft: String(body.sqft || body.requiredArea || "").trim(),
    budget: String(body.budget || "").trim(),
    timeline: String(body.timeline || body.moveInDate || body.moveIn || body.visitDate || "").trim(),
    moveIn: String(body.moveIn || body.moveInDate || body.timeline || "").trim(),
    category: String(body.category || body.officeType || "").trim(),
    intent: body.intent || "property_inquiry",
    sessionId,
    source: body.source || "website_ai_assistant_lead_form",
    propertyId: String(body.propertyId || "").trim(),
    propertyTitle: String(body.propertyTitle || "").trim(),
    visitDate: String(body.visitDate || "").trim(),
    timeSlot: String(body.timeSlot || "").trim(),
    requirement: String(body.requirement || "").trim(),
    history: Array.isArray(body.history) ? body.history : [],
    transcript: Array.isArray(body.fullTranscript) ? body.fullTranscript : (Array.isArray(body.history) ? body.history : []),
    fullTranscript: Array.isArray(body.fullTranscript) ? body.fullTranscript : (Array.isArray(body.history) ? body.history : []),
    rejectedProperties: Array.isArray(body.rejectedProperties) ? body.rejectedProperties : (body.rejectedPropertyIds || []),
    likedProperty: body.likedProperty || null,
    likedPropertyTitle: body.likedProperty?.title || "",
    likedPropertyImage: body.likedProperty?.imageUrl || "",
    likedPropertyPrice: body.likedProperty?.price || "",
    likedPropertyLocation: body.likedProperty?.location || ""
  };
}

function requirementDetails(draft) {
  return [
    draft.requirement,
    draft.propertyId,
    draft.propertyTitle,
    draft.officeType,
    draft.category,
    draft.location,
    draft.teamSize,
    draft.requiredArea,
    draft.likedPropertyTitle,
    draft.visitDate && draft.timeSlot ? `${draft.visitDate} ${draft.timeSlot}` : ""
  ].filter(Boolean).join(" ").trim();
}

function validatePayload(draft) {
  const contactVal = validateContactDetails(draft);
  const errors = { ...contactVal.errors };
  const walkthrough = draft.source === "walkthrough" || Boolean(draft.visitDate && draft.timeSlot);

  if (walkthrough) {
    if (!contactVal.normalized.email) errors.email = "Please enter your work email.";
    if (!contactVal.normalized.company) errors.company = "Please enter your business name.";
    if (!draft.visitDate) errors.visitDate = "Please select a preferred date.";
    if (!["Morning", "Afternoon", "Evening"].includes(draft.timeSlot)) {
      errors.timeSlot = "Please select Morning, Afternoon, or Evening.";
    }
    if (!draft.propertyId) errors.propertyId = "Please select a property ID.";
  }

  let requirement = requirementDetails({ ...draft, ...contactVal.normalized });
  if (!requirement && String(draft.source || "").includes("assistant")) {
    requirement = "AI website enquiry";
  }
  if (!requirement) errors.requirement = "Please share your space requirement details.";

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized: contactVal.normalized,
    requirement,
    walkthrough
  };
}

export default async (request) => {
  const headers = cors(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    if (request.method === "GET") {
      const leads = await listLeads();
      return json({ leads }, 200, headers);
    }

    if (request.method === "PATCH") {
      const body = await request.json();
      if (!body.id) return json({ error: "Lead id required" }, 400, headers);
      const { lead } = await updateLeadStatus(body.id, body.status || "contacted");
      return json({ success: true, lead }, 200, headers);
    }

    if (request.method === "DELETE") {
      const url = new URL(request.url);
      const idParam = url.searchParams.get("id");
      let body = {};
      try { body = await request.json(); } catch {}
      const id = idParam || body.id;
      if (!id) return json({ error: "Lead id required" }, 400, headers);
      await deleteLeadRecord(id);
      return json({ success: true, deletedId: id }, 200, headers);
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);

    const body = await request.json();
    const draft = leadFromBody(body);
    const validated = validatePayload(draft);
    if (!validated.valid) {
      return json({
        error: Object.values(validated.errors)[0] || "Invalid lead details.",
        errors: validated.errors
      }, 400, headers);
    }

    draft.name = validated.normalized.name;
    draft.phone = validated.normalized.phone;
    if (validated.normalized.email) draft.email = validated.normalized.email;
    if (validated.normalized.company) draft.company = validated.normalized.company;
    draft.requirement = validated.requirement;
    draft.publicId = publicLeadId();

    const { lead, isNew } = await upsertLead(draft.sessionId, draft);
    const commercial = await saveCommercialLead({
      ...lead,
      publicId: draft.publicId,
      requirement: draft.requirement
    });
    const enquiryText = formatLeadMessage({ ...lead, ...commercial });
    const alreadyNotified = Boolean(lead.notified);
    if (!alreadyNotified) {
      await notifyNewLead({ ...lead, ...commercial, notifyText: enquiryText });
    }

    return json({
      success: true,
      leadId: commercial.publicId,
      message: enquiryText,
      lead: { ...lead, ...commercial, notified: true, notifyText: enquiryText },
      whatsappUrl: whatsappEnquiryUrl({ ...lead, ...commercial }),
      alreadyNotified: alreadyNotified && !isNew
    }, 200, headers);
  } catch (error) {
    console.error("Lead capture error:", error.message);
    return json({ error: "Failed to capture lead" }, 500, headers);
  }
};
