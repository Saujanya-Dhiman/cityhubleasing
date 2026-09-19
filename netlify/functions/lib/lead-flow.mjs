export const LEAD_FIELDS = [
  "name",
  "phone",
  "email",
  "company",
  "city",
  "location",
  "officeType",
  "category",
  "teamSize",
  "requiredArea",
  "sqft",
  "budget",
  "leaseDuration",
  "moveInDate",
  "timeline",
  "purpose",
  "amenities",
  "requirements",
  "specialRequirements"
];

export const CONTACT_PROMPT = "Before we explore spaces, may I get your name and best phone number? That way our CityHub leasing team can assist you if you find something you like.";

export const HANDOFF_REASSURANCE = "Thank you — I've shared your requirement and full conversation with our CityHub leasing team. They'll contact you shortly.";

export const NO_CATEGORY_MATCH_REPLY = "No problem — this one may not be the right fit. I can connect you directly with our CityHub leasing expert who can suggest spaces based on your exact requirement.";

const LOCATION_WORDS = /\b(mohali|chandigarh|zirakpur|panchkula|airport road|it city|it park|office|warehouse|showroom|cowork|interested|looking|explore|budget|people|space|immediate|within|sure|visit|expert|schedule)\b/i;

export function canonicalCategory(state = {}) {
  const raw = String(state.category || state.officeType || "").toLowerCase();
  if (/warehouse|godown|industrial/.test(raw)) return "Warehouse";
  if (/showroom|retail/.test(raw)) return "Showroom";
  if (/cowork/.test(raw)) return "Coworking";
  if (/office|cabin|suite|meeting|team/.test(raw)) return "Office Space";
  return "";
}

export function hasContact(state = {}) {
  return Boolean(validateName(state.name).valid && validatePhone(state.phone).valid);
}

export function needsContact(state = {}) {
  return Boolean(state.officeType || state.category) && !hasContact(state);
}

export function normalizeField(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function validateName(name) {
  const trimmed = normalizeField(name);
  if (!trimmed) return { valid: false, error: "Please enter your full name." };
  if (/^\d+$/.test(trimmed)) return { valid: false, error: "Please enter your full name." };
  if (!/^[A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s.'-]{0,60}$/.test(trimmed)) {
    return { valid: false, error: "Please enter your full name." };
  }
  return { valid: true, error: null, normalized: trimmed };
}

export function validatePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  let normalized = digits;
  if ((normalized.length === 12 && normalized.startsWith("91")) || (normalized.length === 11 && normalized.startsWith("0"))) {
    normalized = normalized.slice(-10);
  }
  if (!/^[6-9]\d{9}$/.test(normalized)) {
    return { valid: false, error: "Please enter a valid 10-digit mobile number.", normalized: "" };
  }
  if (/^(\d)\1{9}$/.test(normalized) || normalized === "1234567890") {
    return { valid: false, error: "Please enter a valid 10-digit mobile number.", normalized: "" };
  }
  return { valid: true, error: null, normalized };
}

export function validateEmail(email) {
  const trimmed = normalizeField(email);
  if (!trimmed) return { valid: true, error: null, normalized: "" };
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return { valid: false, error: "Please enter a valid email address.", normalized: trimmed };
  }
  return { valid: true, error: null, normalized: trimmed };
}

export function validateContactDetails(data = {}) {
  const nameRes = validateName(data.name);
  const phoneRes = validatePhone(data.phone);
  const emailRes = validateEmail(data.email);
  const company = normalizeField(data.company);

  const errors = {};
  if (!nameRes.valid) errors.name = nameRes.error;
  if (!phoneRes.valid) errors.phone = phoneRes.error;
  if (!emailRes.valid) errors.email = emailRes.error;

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
    normalized: {
      name: nameRes.normalized || normalizeField(data.name),
      phone: phoneRes.normalized || normalizeField(data.phone),
      email: emailRes.normalized || normalizeField(data.email),
      company
    }
  };
}

export function validateLead(lead) {
  const contactVal = validateContactDetails(lead);
  if (!contactVal.valid) {
    const firstError = Object.values(contactVal.errors)[0] || "Invalid contact details.";
    return { valid: false, error: firstError, errors: contactVal.errors, normalized: contactVal.normalized };
  }
  const normalized = Object.fromEntries(LEAD_FIELDS.map(field => [field, normalizeField(lead[field]).slice(0, 500)]));
  Object.assign(normalized, contactVal.normalized);
  return { valid: true, error: null, normalized };
}

export const buyingIntentPattern = /\b(price|budget|rent|lease|office|warehouse|showroom|coworking|team|move[- ]?in|available|chahiye|dekhna hai|looking for|interested in|need|want|space)\b/i;
export const siteVisitIntentPattern = /\b(visit|site visit|book|schedule|tour|walkthrough|dekhna hai)\b/i;
export const handoffIntentPattern = /\b(talk to (a |an )?(leasing )?(consultant|expert|human|agent)|call me|need expert|insaan se baat|human|agent|whatsapp)\b/i;

export function detectIntent(text) {
  if (handoffIntentPattern.test(text)) return "handoff";
  if (siteVisitIntentPattern.test(text)) return "site_visit";
  if (buyingIntentPattern.test(text)) return "property_inquiry";
  // Short follow-ups in an active lead still count as inquiry
  if (/^\d+\+?\s*(people|persons|seats|desks|sq\.?\s*ft|sqft)?$/i.test(String(text || "").trim())) return "property_inquiry";
  if (/^(under|around|upto|about)?\s*[\d.,]+\s*(k|lakh|l|thousand|cr)?$/i.test(String(text || "").trim())) return "property_inquiry";
  return "general";
}

function setIfEmpty(state, key, value) {
  if (!state[key] && value) state[key] = value;
}

function overwriteIfPresent(state, key, value) {
  if (value) state[key] = value;
}

export function extractSlots(text, currentState = {}) {
  const state = { ...currentState };
  const raw = String(text || "");
  const lowerText = raw.toLowerCase();

  const mentionsWarehouse = /\b(warehouse|godown|industrial)\b/.test(lowerText);
  const mentionsShowroom = /\b(showroom|retail shop|retail)\b/.test(lowerText);
  if (mentionsWarehouse && mentionsShowroom) {
    state.exploreTrack = "warehouse_showroom";
  } else if (/\b(coworking|co-working|shared desk|hot desk)\b/.test(lowerText)) {
    overwriteIfPresent(state, "officeType", "Coworking");
    state.category = "Coworking";
  } else if (/\b(meeting room|conference room|board room)\b/.test(lowerText)) {
    overwriteIfPresent(state, "officeType", "Meeting Room");
    state.category = "Office";
  } else if (/\b(private office|cabin|dedicated office|office space|offices)\b/.test(lowerText) || /^office( space)?$/i.test(raw.trim()) || /\bfor my team\b/.test(lowerText)) {
    overwriteIfPresent(state, "officeType", "Private Office");
    state.category = "Office";
  } else if (mentionsWarehouse || /^warehouses?$/i.test(raw.trim())) {
    overwriteIfPresent(state, "officeType", "Warehouse");
    state.category = "Warehouse";
  } else if (mentionsShowroom || /^showrooms?$/i.test(raw.trim())) {
    overwriteIfPresent(state, "officeType", "Showroom");
    state.category = "Showroom";
  } else if (/\b(office)\b/.test(lowerText) && !state.officeType) {
    state.officeType = "Private Office";
    state.category = "Office";
  }
  if (state.officeType) {
    state.category = canonicalCategory(state) || state.category;
  }

  // Location / sector / landmark
  if (/\b(mohali)\b/.test(lowerText)) overwriteIfPresent(state, "location", "Mohali");
  else if (/\b(chandigarh)\b/.test(lowerText)) overwriteIfPresent(state, "location", "Chandigarh");
  else if (/\b(zirakpur)\b/.test(lowerText)) overwriteIfPresent(state, "location", "Zirakpur");
  else if (/\b(panchkula)\b/.test(lowerText)) overwriteIfPresent(state, "location", "Panchkula");
  else if (/\b(airport road)\b/.test(lowerText)) overwriteIfPresent(state, "location", "Airport Road");
  else if (/\b(it city|it park)\b/.test(lowerText)) overwriteIfPresent(state, "location", "IT City");
  else if (/\b(phase\s*\d+[a-z]?)\b/i.test(raw)) {
    overwriteIfPresent(state, "location", raw.match(/\b(phase\s*\d+[a-z]?)\b/i)[0].replace(/\s+/g, " "));
  } else if (/\b(sector\s*\d+[a-z]?)\b/i.test(raw)) {
    overwriteIfPresent(state, "location", raw.match(/\b(sector\s*\d+[a-z]?)\b/i)[0].replace(/\s+/g, " "));
  }

  // Purpose
  if (/\b(startup)\b/.test(lowerText)) setIfEmpty(state, "purpose", "Startup");
  else if (/\b(corporate|company office)\b/.test(lowerText)) setIfEmpty(state, "purpose", "Corporate office");
  else if (/\b(branch office)\b/.test(lowerText)) setIfEmpty(state, "purpose", "Branch office");
  else if (/\b(team workspace)\b/.test(lowerText)) setIfEmpty(state, "purpose", "Team workspace");

  // Team size — 5 people, 20+, 20+ people, 20 or more people, or a bare number
  const teamMatch =
    raw.match(/\b(\d+)\s*\+?\s*(seats|people|persons|person|pax|team|desks|employees|members)\b/i) ||
    raw.match(/\b(\d+)\s+or\s+more(?:\s+(people|persons|seats|desks))?/i) ||
    raw.match(/\b(\d+)\s*\+/i) ||
    (!state.teamSize && /^\s*(\d{1,3})\+?\s*$/.test(raw) ? raw.match(/^\s*(\d{1,3})/) : null);
  if (teamMatch) {
    const n = String(teamMatch[1] || teamMatch[0]).replace(/\D/g, "");
    const plus = /\+|or\s+more/i.test(raw);
    if (n) state.teamSize = plus ? `${n}+ people` : `${n} people`;
  }

  // Area / sq ft chips
  if (/under\s*500\s*sq/i.test(lowerText)) state.requiredArea = "Under 500 sq ft";
  else if (/10,?\s*000\+\s*sq/i.test(lowerText) || /10000\+\s*sq/i.test(lowerText)) state.requiredArea = "10,000+ sq ft";
  else if (/5,?\s*000\s*[–\-to]+\s*10,?\s*000\s*sq/i.test(lowerText)) state.requiredArea = "5,000–10,000 sq ft";
  else if (/2,?\s*000\s*[–\-to]+\s*5,?\s*000\s*sq/i.test(lowerText)) state.requiredArea = "2,000–5,000 sq ft";
  else if (/1,?\s*000\s*[–\-to]+\s*2,?\s*000\s*sq/i.test(lowerText)) state.requiredArea = "1,000–2,000 sq ft";
  else if (/500\s*[–\-to]+\s*1,?\s*000\s*sq/i.test(lowerText)) state.requiredArea = "500–1,000 sq ft";
  else {
    const areaMatch = raw.match(/\b(\d{2,5})\s*(sq\.?\s*ft|sqft|sft)\b/i);
    if (areaMatch) state.requiredArea = areaMatch[0].replace(/\s+/g, " ");
  }
  if (state.requiredArea) state.sqft = state.requiredArea;

  // Budget — chips like "Under 50k", "Under 1 Lakh", "1-5 Lakhs", "around 50,000"
  // Do not treat team-size phrases ("about 15 people") as budget.
  const looksLikeTeamPhrase = /\b\d+\s*\+?\s*(seats|people|persons|person|pax|team|desks|employees|members)\b|\b\d+\s+or\s+more\b|\b\d+\s*\+/i.test(raw);
  if (/under\s*₹?\s*50\s*k/i.test(lowerText) || /under\s*50000/i.test(lowerText) || /under\s*50k/i.test(lowerText)) state.budget = "Under ₹50K";
  else if (/₹?\s*5\s*l\+|^₹5L\+$/i.test(raw.trim()) || /5\s*lakh\s*\+/i.test(lowerText)) state.budget = "₹5L+";
  else if (/₹?\s*3\s*l\s*[–\-to]+\s*₹?\s*5\s*l/i.test(lowerText)) state.budget = "₹3L–₹5L";
  else if (/₹?\s*1\s*l\s*[–\-to]+\s*₹?\s*3\s*l/i.test(lowerText)) state.budget = "₹1L–₹3L";
  else if (/₹?\s*50\s*k\s*[–\-to]+\s*₹?\s*1\s*l/i.test(lowerText)) state.budget = "₹50K–₹1L";
  else if (/under\s*1\s*lakh/i.test(lowerText)) state.budget = "₹50K–₹1L";
  else if (/1\s*[-–to]+\s*5\s*lakhs?/i.test(lowerText)) state.budget = "₹1L–₹3L";
  else if (!looksLikeTeamPhrase) {
    const budgetChip = raw.match(/^(under|around|upto|about)?\s*([\d.,]+)\s*(k|lakh|l|thousand|cr|lakhs)?$/i);
    const budgetInline = raw.match(/(?:budget|price|rent)\s*(?:is|of)?\s*(?:around|under|upto|about)?\s*([\d.,]+)\s*(lakh|lakhs|l|k|thousand|cr)?/i)
      || raw.match(/\b(?:around|under|upto|about)\s*([\d.,]+)\s*(lakh|lakhs|l|k|thousand|cr)\b/i)
      || raw.match(/\b([\d.,]+)\s*(lakh|lakhs|k|thousand|cr)\b/i);
    if (budgetChip && budgetChip[2] && (budgetChip[1] || budgetChip[3])) {
      const unit = budgetChip[3] || "";
      state.budget = `${budgetChip[1] ? budgetChip[1] + " " : ""}${budgetChip[2]}${unit ? " " + unit : ""}`.trim();
    } else if (budgetInline) {
      state.budget = budgetInline[0].trim();
    }
  }

  // Lease duration
  const leaseMatch = raw.match(/\b(\d+)\s*(month|months|year|years)\s*(lease|contract)?\b/i);
  if (leaseMatch) state.leaseDuration = leaseMatch[0].trim();
  else if (/\b(monthly|quarterly|annual|yearly)\b/.test(lowerText)) {
    state.leaseDuration = lowerText.match(/\b(monthly|quarterly|annual|yearly)\b/)[0];
  }

  // Contact
  if (!state.email) {
    const emailMatch = raw.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
    if (emailMatch) state.email = emailMatch[0];
  }
  const phoneMatch = raw.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
  if (phoneMatch && !state.phone) {
    const phoneRes = validatePhone(phoneMatch[0]);
    if (phoneRes.valid) state.phone = phoneRes.normalized;
  }
  if (!state.name) {
    const nameMatch = raw.match(/(?:my name is|name is|this is)\s+([A-Za-z][A-Za-z.'\s]{1,40})/i);
    const candidate = nameMatch ? nameMatch[1].trim() : "";
    const leftover = raw
      .replace(phoneMatch ? phoneMatch[0] : "", " ")
      .replace(/\b(my name is|i am|i'm|this is|name is|phone|number|and|please|hi|hello)\b/gi, " ")
      .replace(/[,\-:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const guess = candidate || ((state.officeType || state.category) ? leftover : "");
    const nameRes = validateName(guess);
    if (nameRes.valid && !LOCATION_WORDS.test(guess)) {
      state.name = nameRes.normalized;
    }
  }
  if (state.email) {
    const emailRes = validateEmail(state.email);
    if (!emailRes.valid) delete state.email;
    else state.email = emailRes.normalized;
  }
  if (!state.company) {
    const companyMatch = raw.match(/(?:my company is|company(?:\s+name)?(?:\s+is)?|working at|at)\s+([A-Za-z0-9][A-Za-z0-9\s&.-]{1,40})/i);
    if (companyMatch && companyMatch[1].trim().split(/\s+/).length <= 5) {
      state.company = companyMatch[1].trim();
    }
  }

  // Timeline
  if (/\b(immediate(?:ly)?|asap|right away|jaldi|turant|this week)\b/.test(lowerText)) {
    state.timeline = "Immediate";
    state.moveInDate = "Immediate";
  } else {
    const timelineMatch = raw.match(/\b(?:within|in)?\s*(\d+)\s*(days|months|weeks)\b/i);
    if (timelineMatch) {
      state.timeline = timelineMatch[0].trim();
      state.moveInDate = timelineMatch[0].trim();
    }
  }

  // Amenities / special
  if (/\bnot sure\b/i.test(lowerText)) {
    if (!state.requiredArea && (state.officeType === "Warehouse" || state.officeType === "Showroom")) {
      state.requiredArea = "Not Sure";
      state.sqft = "Not Sure";
    } else if (!state.budget) {
      state.budget = "Not Sure";
    }
  }

  if (/\b(furnished|plug[- ]?and[- ]?play|parking|wifi|internet|hvac|power backup|cabin)\b/i.test(raw)) {
    const found = raw.match(/\b(furnished|plug[- ]?and[- ]?play|parking|wifi|internet|hvac|power backup|cabin)s?\b/gi);
    if (found?.length) {
      const joined = [...new Set(found.map(v => v.toLowerCase()))].join(", ");
      state.amenities = state.amenities ? `${state.amenities}, ${joined}` : joined;
    }
  }

  return state;
}

export function getQualificationStage(state = {}) {
  if (!state.officeType) return 1;
  if (!hasContact(state)) return 2;
  if (!state.location) return 3;
  if (!state.teamSize && state.officeType !== "Warehouse" && state.officeType !== "Showroom") return 4;
  if (!state.requiredArea && (state.officeType === "Warehouse" || state.officeType === "Showroom")) return 4;
  if (!state.budget) return 5;
  if (!state.timeline && !state.moveInDate) return 6;
  return 7;
}

export function getNextQuestion(state, language = "en") {
  const isHi = language === "hi" || language === "hinglish";
  const stage = getQualificationStage(state);

  if (stage === 1) {
    if (state.exploreTrack === "warehouse_showroom") {
      return isHi
        ? "Warehouse dekhna hai ya showroom?"
        : "Would you like to explore warehouses or showrooms?";
    }
    return isHi
      ? "Aap kis tarah ka space dhoond rahe hain — Office, Coworking, Warehouse, ya Showroom?"
      : "What type of space are you looking for — Office, Coworking, Warehouse, or Showroom?";
  }
  if (stage === 2) {
    return CONTACT_PROMPT;
  }
  if (stage === 3) {
    if (state.officeType === "Coworking") {
      return isHi
        ? "Kis location mein coworking chahiye — Chandigarh, Mohali, ya koi specific area?"
        : "Which location works best — Chandigarh, Mohali, or a specific area nearby?";
    }
    return isHi
      ? "Kaunsi location prefer karenge — Chandigarh, Mohali, Zirakpur, Panchkula, ya koi specific sector?"
      : "Which location are you considering — Chandigarh, Mohali, Zirakpur, Panchkula, or a specific sector?";
  }
  if (stage === 4) {
    if (state.officeType === "Warehouse" || state.officeType === "Showroom") {
      return isHi ? "Kitne square feet ka area chahiye?" : "Roughly how much area do you need (in sq ft)?";
    }
    if (state.officeType === "Coworking") {
      return isHi
        ? "Dedicated desk, private cabin, ya team workspace chahiye? Aur kitne log hain?"
        : "Are you looking for a dedicated desk, private cabin, or a team workspace — and for how many people?";
    }
    return isHi ? "Aapki team mein kitne log hain?" : "What size team are you planning for?";
  }
  if (stage === 5) {
    return isHi ? "Aapka approximate monthly budget kya hai?" : "What's your approximate monthly budget?";
  }
  if (stage === 6) {
    return isHi ? "Move-in kab tak karna hai — immediate, 15–30 days, ya baad mein?" : "When are you looking to move in — immediate, within 15–30 days, or later?";
  }
  return null;
}

export function summarizeLeadState(state = {}) {
  const parts = [];
  if (state.officeType) parts.push(`space=${state.officeType}`);
  if (state.location) parts.push(`location=${state.location}`);
  if (state.teamSize) parts.push(`team=${state.teamSize}`);
  if (state.requiredArea) parts.push(`area=${state.requiredArea}`);
  if (state.budget) parts.push(`budget=${state.budget}`);
  if (state.timeline || state.moveInDate) parts.push(`timeline=${state.timeline || state.moveInDate}`);
  if (state.purpose) parts.push(`purpose=${state.purpose}`);
  if (state.leaseDuration) parts.push(`lease=${state.leaseDuration}`);
  return parts.join("; ") || "none yet";
}
