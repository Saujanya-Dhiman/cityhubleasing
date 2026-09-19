import { fallback, isCasual, normalize, casualReply, looksUnsafe, detectLanguage, retrieve } from "./lib/rag.mjs";
import { cors, isChatConfigured, json, adminNotifyWebhookUrl, assistantName, chatModel, chatApiUrl, chatHeaders, chatModelsToTry, extractChatText, parseProviderError } from "./lib/config.mjs";
import { allow } from "./lib/rate-limit.mjs";
import { extractSlots, detectIntent, getNextQuestion, getQualificationStage, summarizeLeadState, canonicalCategory, hasContact, needsContact, CONTACT_PROMPT, HANDOFF_REASSURANCE, validateContactDetails, validateName, validatePhone, validateEmail } from "./lib/lead-flow.mjs";
import { searchProperties, parsePropertyQuery, inventoryBrief } from "./lib/property-search.mjs";
import { CITYHUB_SYSTEM_PROMPT, STREAM_ERROR_FALLBACK, isOffTopicQuery, offTopicReply } from "./lib/system-prompt.mjs";
import { tryDb } from "./lib/firebase.mjs";
import { leadId, upsertLead } from "./lib/lead-store.mjs";
import admin from "firebase-admin";

const PROVIDER_BUSY = STREAM_ERROR_FALLBACK;
const CITYHUB_FACTS = "CityHub Leasing offers offices, coworking, meeting rooms, warehouses, and showrooms in Mohali, Chandigarh, and Tricity. Address: Phase 8B, Industrial Area, Sector 74, Mohali. Hours: Mon–Sat 9:00–18:00. Phone +91 76965 10579. Email cityhub.leasing@gmail.com.";

async function notifyAdmin(leadState, sessionId) {
  if (!adminNotifyWebhookUrl) return;
  try {
    await fetch(adminNotifyWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "human_handoff", sessionId, leadState })
    });
  } catch (error) {
    console.error("Webhook failed", error.message);
  }
}

function sseChunkText(parsed) {
  if (!parsed || parsed.error) return "";
  const delta = parsed.choices?.[0]?.delta?.content;
  if (typeof delta === "string") return delta;
  return extractChatText(parsed) || "";
}

function sseEncode(encoder, text) {
  const lines = String(text).split("\n");
  return encoder.encode(`${lines.map(line => `data: ${line}`).join("\n")}\n\n`);
}

function textToSseStream(text) {
  const payload = String(text || STREAM_ERROR_FALLBACK);
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(sseEncode(encoder, payload));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
}

function makeClientSseStream(reader, decoder, prefix = "", fallbackText = STREAM_ERROR_FALLBACK) {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let buffer = prefix;
      let emitted = false;

      const emitSseLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) return;
        const dataStr = trimmed.replace(/^data:\s*/, "").trim();
        if (!dataStr || dataStr === "[DONE]") return;
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            console.error("SSE provider error", parseProviderError(parsed));
            return false;
          }
          const content = sseChunkText(parsed);
          if (content) {
            controller.enqueue(sseEncode(encoder, content));
            emitted = true;
          }
          return true;
        } catch (err) {
          console.error("Error parsing SSE chunk:", err.message);
          return false;
        }
      };

      const failSoft = () => {
        if (!emitted) controller.enqueue(sseEncode(encoder, fallbackText));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) emitSseLine(line);
        }
        if (buffer) emitSseLine(buffer);
        if (!emitted) controller.enqueue(sseEncode(encoder, fallbackText));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("Stream processing error:", err.message);
        try {
          failSoft();
        } catch {
          // Controller already closed
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    }
  });
}

async function readFullText(reader, decoder, prefix = "") {
  let text = prefix;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function headerSafe(value) {
  try {
    return encodeURIComponent(typeof value === "string" ? value : JSON.stringify(value || {}));
  } catch {
    return encodeURIComponent("{}");
  }
}

function attachMeta(headers, { currentState, properties, sources, intent }) {
  const next = new Headers(headers);
  next.set("X-Lead-State", headerSafe(currentState || {}));
  next.set("X-Properties", headerSafe(properties || []));
  next.set("X-Sources", headerSafe(sources || []));
  next.set("X-Intent", headerSafe(String(intent || "general")));
  return next;
}

function sseHeaders(headers, extra) {
  const meta = attachMeta(headers, extra);
  meta.set("Content-Type", "text/event-stream; charset=utf-8");
  meta.set("Cache-Control", "no-cache, no-transform");
  meta.set("Connection", "keep-alive");
  meta.set("X-Accel-Buffering", "no");
  return meta;
}

function replyText(text, extra, headers, isStream) {
  if (isStream) {
    return new Response(textToSseStream(text), { status: 200, headers: sseHeaders(headers, extra) });
  }
  const meta = attachMeta(headers, extra);
  return json({
    answer: text,
    sources: extra.sources || [],
    leadState: extra.currentState || {},
    intent: extra.intent,
    properties: extra.properties || []
  }, 200, Object.fromEntries(meta.entries()));
}

function historyMessages(history, question) {
  let chatHistory = Array.isArray(history) ? history : [];
  if (chatHistory.length && chatHistory[chatHistory.length - 1].content === question) {
    chatHistory = chatHistory.slice(0, -1);
  }
  return chatHistory.slice(-6).map(item => ({
    role: item.role === "assistant" ? "assistant" : "user",
    content: normalize(item.content).slice(0, 400)
  }));
}

function buildInstructions({ language, currentState, nextQuestion, properties, context, intent }) {
  const stage = getQualificationStage(currentState);
  const known = summarizeLeadState(currentState);
  const inventory = inventoryBrief(properties);
  const category = currentState.category || currentState.officeType || "Commercial Space";
  const missing = [
    !currentState.officeType && "Requirement Type",
    !hasContact(currentState) && "Contact Phone",
    !currentState.company && "Business Name",
    !currentState.location && "Preferred Micro-market",
    !(currentState.teamSize || currentState.requiredArea || currentState.sqft) && "Sq Ft / Seat Count",
    !currentState.budget && "Budget",
    !(currentState.timeline || currentState.moveInDate) && "Move-in Date"
  ].filter(Boolean);

  let instructions = `${CITYHUB_SYSTEM_PROMPT}

Language: match the visitor (${language}).
Active category: ${category}.
Known requirement state: ${known}
Still needed: ${missing.join(", ") || "none — summarize and offer a site visit"}.
Stage: ${stage}/7. Intent: ${intent}.`;

  if (inventory) {
    instructions += `\n\nVERIFIED MATCHING INVENTORY:\n${inventory}\nMention you found ${properties.length} matching option${properties.length === 1 ? "" : "s"} and invite a site visit if appropriate. Do not invent additional listings.`;
  } else {
    instructions += `\n\nVERIFIED MATCHING INVENTORY:\n(none for this query — do not invent properties.)`;
  }

  if (nextQuestion && stage === 2) {
    instructions += `\n\nAsk for name and phone conversationally using this wording (keep it natural, do not show a form): "${nextQuestion}"`;
  } else if (nextQuestion && stage < 7) {
    instructions += `\n\nAsk this next qualification question naturally (paraphrase OK, do not copy robotically): "${nextQuestion}"`;
  } else if (stage >= 7 && !inventory) {
    instructions += `\n\nRequirements are complete. Summarize what you understood, invite a site visit or callback, and offer to connect on WhatsApp.`;
  }

  if (currentState.name && hasContact(currentState)) {
    const first = String(currentState.name).trim().split(/\s+/)[0];
    instructions += `\n\nVisitor first name: ${first}. Use it naturally (e.g. "Thanks, ${first}."). Never ask for name or phone again. Never display the visitor's phone number or email in chat.`;
  }
  if (currentState.company) {
    instructions += `\n\nBusiness name: ${currentState.company}.`;
  }

  if (currentState.likedProperty?.title) {
    instructions += `\n\nLiked Property: ${currentState.likedProperty.title} (${currentState.likedProperty.location || ""}, ${currentState.likedProperty.price || ""}). Reference this preferred space in your response when offering a site visit.`;
  }

  instructions += `\n\nWEBSITE CONTEXT:\n${context || "CityHub Leasing offers offices, coworking, warehouses, and showrooms in Mohali and Chandigarh. Phone +91 76965 10579."}`;
  return instructions;
}

/**
 * The first few leasing questions are a fixed qualification flow.  Do not send
 * them to the LLM: a transient provider error used to turn an otherwise valid
 * answer such as "Mohali" or "10 people" into the generic website fallback.
 */
function qualificationReply(state, language) {
  const hinglish = language === "hi" || language === "hinglish";
  const stage = getQualificationStage(state);

  if (stage === 1) {
    return hinglish
      ? "Main help karti hoon office, coworking, meeting room, warehouse, ya showroom dhoondhne mein. Aap kya dekh rahe hain?"
      : "I can help you find an office, coworking desk, meeting room, warehouse, or showroom. What would you like to explore?";
  }

  if (stage === 2) {
    return CONTACT_PROMPT;
  }

  if (stage === 3) {
    return hinglish
      ? `${state.officeType} ke liye Mohali, Chandigarh, ya koi specific area better rahega?`
      : `Lovely — ${state.officeType.toLowerCase()} it is. Which area works best: Mohali, Chandigarh, or a specific corridor?`;
  }

  if (stage === 4) {
    if (state.officeType === "Warehouse" || state.officeType === "Showroom") {
      return hinglish
        ? `${state.location} accha option hai. Roughly kitne sq ft chahiye?`
        : `${state.location} is a strong fit. Roughly how many square feet do you need?`;
    }
    return hinglish
      ? `${state.location} noted. Team mein kitne log honge?`
      : `${state.location} works well. How many people should we plan for?`;
  }

  if (stage === 5) {
    return hinglish
      ? `${state.teamSize || state.requiredArea} ke liye ${state.location} mein — monthly budget kitna soch rahe hain?`
      : `Got it${state.teamSize ? ` — ${state.teamSize}` : ""} in ${state.location}. What monthly budget should I work with?`;
  }

  if (stage === 6) {
    return hinglish
      ? `Budget ${state.budget} ke around. Move-in kab tak karna hai?`
      : `That budget is helpful. When would you like to move in?`;
  }

  if (stage === 7) {
    if (state.officeType === "Warehouse") {
      return hinglish
        ? "Great — aapki warehouse requirement note ho gayi hai. Available warehouses explore karne ke liye neeche option choose kijiye."
        : "Great — I have your warehouse requirements. Choose the option below to explore available warehouses.";
    }
    if (state.officeType === "Showroom") {
      return hinglish
        ? "Great — aapki showroom requirement note ho gayi hai. Available showrooms explore karne ke liye neeche option choose kijiye."
        : "Great — I have your showroom requirements. Choose the option below to explore available showrooms.";
    }
    return hinglish
      ? "Great — aapki office-space requirement note ho gayi hai. Available office spaces explore karne ke liye neeche location choose kijiye."
      : "Great — I have your office-space requirements. Where would you like to explore available office spaces?";
  }

  return null;
}

function snippetFromContext(context = "") {
  const cleaned = String(context)
    .replace(/\[\d+\]\s*/g, "")
    .replace(/URL:\s*\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const sentence = cleaned.split(/(?<=[.!?])\s+/).find(part => part.length > 40) || cleaned;
  return sentence.slice(0, 280).trim();
}

function consultantFallback({ question, language, currentState, properties, context, intent }) {
  const hinglish = language === "hi" || language === "hinglish";
  const guided = qualificationReply(currentState, language);
  const inventory = inventoryBrief(properties);
  const fact = snippetFromContext(context);
  const q = String(question || "").toLowerCase();

  if (/address|where are you|location of cityhub|office kahan|phase 8/i.test(q) && /hour|timing|open|kab khul/i.test(q)) {
    return hinglish
      ? "CityHub Phase 8B, Industrial Area, Sector 74, Mohali mein hai. Timing: Monday–Saturday, 9:00 AM–6:00 PM. Visit book karna ho to bataiye, ya +91 76965 10579 par call kijiye."
      : "CityHub is at Phase 8B, Industrial Area, Sector 74, Mohali. We’re open Monday–Saturday, 9:00 AM–6:00 PM. I can book a site visit, or you can call +91 76965 10579.";
  }
  if (/address|where are you|location of cityhub|office kahan|phase 8/i.test(q)) {
    return hinglish
      ? "CityHub Phase 8B, Industrial Area, Sector 74, Mohali mein hai. Site visit book karna ho to bataiye, ya +91 76965 10579 par call kijiye."
      : "CityHub is at Phase 8B, Industrial Area, Sector 74, Mohali. I can book a site visit, or you can call +91 76965 10579.";
  }
  if (/phone|contact|email|whatsapp|number/i.test(q)) {
    return hinglish
      ? "Aap +91 76965 10579 par call/WhatsApp kar sakte hain, ya cityhub.leasing@gmail.com par email kijiye. Main requirement note karke team ko bhej sakti hoon."
      : "You can call or WhatsApp +91 76965 10579, or email cityhub.leasing@gmail.com. I can also take your requirement and connect the leasing team.";
  }
  if (/hour|timing|open|kab khul/i.test(q)) {
    return hinglish
      ? "Hum Monday to Saturday, 9:00 AM se 6:00 PM tak available hain. Visit schedule karna ho to time bata den."
      : "We’re available Monday to Saturday, 9:00 AM to 6:00 PM. Tell me a preferred slot and I’ll arrange a visit.";
  }
  if (/furnished|wifi|internet|backup|hvac|amenit|plug/i.test(q)) {
    return hinglish
      ? "Hamare offices typically plug-and-play hote hain — furniture, high-speed internet, HVAC, aur power backup ke saath. Aapko kis type ka space chahiye?"
      : "Our offices are typically plug-and-play with furniture, high-speed internet, HVAC, and power backup. What type of space are you considering?";
  }
  if (/lease|minimum|duration|kitne month/i.test(q)) {
    return hinglish
      ? "Flexible leases available hain — monthly, quarterly, aur annual. Team size aur location bataiye, main matching options suggest karti hoon."
      : "We offer flexible leases — monthly, quarterly, and annual. Share your team size and preferred location and I’ll match options.";
  }

  if (inventory) {
    const intro = hinglish
      ? `Aapki requirement ke hisaab se ye current options hain:\n${inventory}\nSite visit book karein?`
      : `Based on your requirement, these are current matching options:\n${inventory}\nWould you like to book a site visit?`;
    return intro;
  }

  if (guided && (intent === "property_inquiry" || intent === "site_visit" || currentState.officeType)) {
    if (fact && getQualificationStage(currentState) <= 2) {
      return hinglish ? `${fact} ${guided}` : `${fact} ${guided}`;
    }
    return guided;
  }

  if (fact) {
    const closer = hinglish
      ? "Aapko office, coworking, warehouse, ya showroom chahiye?"
      : "Are you looking for an office, coworking, warehouse, or showroom?";
    return `${fact} ${closer}`;
  }

  return hinglish
    ? `${CITYHUB_FACTS} Aap kis tarah ka space dhoond rahe hain?`
    : `${CITYHUB_FACTS} What kind of space are you looking for?`;
}

function isProviderRateLimit(error) {
  return /HTTP 429|rate.?limit|too many requests/i.test(String(error?.message || error || ""));
}

function isProviderAuthError(error) {
  return /HTTP 401|HTTP 403|mismatched_client_ip|invalid api key|unauthorized|auth_error/i.test(String(error?.message || error || ""));
}

async function requestCompletion(model, messages, stream) {
  const started = Date.now();
  console.log("AI provider request start", { model, stream, messageCount: messages.length });
  const response = await fetch(chatApiUrl, {
    method: "POST",
    headers: chatHeaders(),
    body: JSON.stringify({ model, messages, stream })
  });
  console.log("AI provider response", { model, status: response.status, ms: Date.now() - started });
  const contentType = response.headers.get("content-type") || "";
  return { response, contentType };
}

async function completionFromJson(raw, status) {
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Chat request failed: HTTP ${status} ${String(raw).slice(0, 300)}`);
  }
  if (status >= 400 || data.error) {
    throw new Error(`Chat request failed: ${parseProviderError(data, status)}`);
  }
  const text = extractChatText(data);
  if (!text) throw new Error("Chat request failed: empty completion");
  return text;
}

async function completeWithModel({ model, messages, isStream, extra, headers, fallbackText = STREAM_ERROR_FALLBACK }) {
  const { response, contentType } = await requestCompletion(model, messages, isStream);

  if (!isStream || !response.ok || !response.body) {
    const raw = await response.text();
    if (!response.ok) {
      console.error("Chat API HTTP error", { model, status: response.status, contentType, body: raw.slice(0, 500) });
      throw new Error(`Chat request failed: ${parseProviderError(raw, response.status)}`);
    }
    const text = await completionFromJson(raw, response.status);
    return replyText(text, extra, headers, isStream);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const first = await reader.read();
  const prefix = decoder.decode(first.value || new Uint8Array(), { stream: true });
  const trimmed = prefix.trimStart();

  if (trimmed.startsWith("{") && !trimmed.includes("data:")) {
    const raw = await readFullText(reader, decoder, prefix);
    console.error("Stream returned JSON instead of SSE", { model, body: raw.slice(0, 500) });
    const text = await completionFromJson(raw, response.status);
    return replyText(text, extra, headers, true);
  }

  const firstData = trimmed.match(/^data:\s*(\{[\s\S]*?)(?:\n|$)/);
  if (firstData) {
    try {
      const parsed = JSON.parse(firstData[1]);
      if (parsed.error) {
        throw new Error(`Chat request failed: ${parseProviderError(parsed, response.status)}`);
      }
    } catch (error) {
      if (String(error.message).startsWith("Chat request failed")) throw error;
    }
  }

  return new Response(makeClientSseStream(reader, decoder, prefix, fallbackText), {
    status: 200,
    headers: sseHeaders(headers, extra)
  });
}

async function completeChat({ messages, isStream, extra, headers, fallbackText }) {
  const models = chatModelsToTry(chatModel).slice(0, 2);
  let lastError = null;
  let hitProvider429 = false;
  let hitAuth = false;
  const safeFallback = fallbackText || fallback;

  for (const model of models) {
    try {
      return await completeWithModel({ model, messages, isStream, extra, headers, fallbackText: safeFallback });
    } catch (error) {
      lastError = error;
      console.error("Chat completion failed", { model, stream: isStream, message: error.message });
      if (isProviderAuthError(error)) {
        hitAuth = true;
        break;
      }
      if (isProviderRateLimit(error)) {
        hitProvider429 = true;
        break;
      }
    }
  }

  if (isStream && !hitProvider429 && !hitAuth) {
    const model = models[0];
    try {
      console.error("Retrying chat once without streaming", { model });
      return await completeWithModel({ model, messages, isStream: false, extra, headers, fallbackText: safeFallback });
    } catch (error) {
      lastError = error;
      console.error("Non-stream chat fallback failed", { model, message: error.message });
      if (isProviderAuthError(error)) hitAuth = true;
      if (isProviderRateLimit(error)) hitProvider429 = true;
    }
  }

  console.error("All chat models failed", lastError?.message || "unknown error");
  if (hitAuth) {
    console.error("Provider blocked this network (API key IP restriction). Using on-site leasing consultant fallback.");
  }
  return replyText(hitProvider429 ? PROVIDER_BUSY : safeFallback, extra, headers, isStream);
}

function sanitizedLeadState(state = {}) {
  const next = { ...state };
  const nameRes = validateName(next.name);
  const phoneRes = validatePhone(next.phone);
  const emailRes = validateEmail(next.email);
  if (nameRes.valid) next.name = nameRes.normalized;
  else delete next.name;
  if (phoneRes.valid) next.phone = phoneRes.normalized;
  else delete next.phone;
  if (emailRes.valid) next.email = emailRes.normalized;
  else delete next.email;
  if (next.company) next.company = String(next.company).replace(/\s+/g, " ").trim();
  return next;
}

function persistLeadRecord({ sessionId, currentState, intent, language, history, extra = {} }) {
  const safe = sanitizedLeadState(currentState);
  const category = canonicalCategory(safe) || safe.category || "";
  return upsertLead(leadId(sessionId), {
    ...safe,
    category,
    sqft: safe.sqft || safe.requiredArea || "",
    moveIn: safe.moveIn || safe.moveInDate || safe.timeline || "",
    rejectedProperties: safe.rejectedPropertyIds || safe.rejectedProperties || extra.rejectedProperties || [],
    likedProperty: safe.likedProperty || null,
    intent,
    source: extra.source || "website_ai_assistant",
    sessionId,
    language,
    fullTranscript: extra.fullTranscript || history,
    handoffRequested: Boolean(extra.handoffRequested)
  }).catch(error => console.error("Lead save failed:", error.message));
}

function continueAfterContactReply(state) {
  const first = String(state.name || "there").trim().split(/\s+/)[0] || "there";
  if (!state.location) {
    return `Thanks, ${first}. Let's find the right space for you. Which area works best — Mohali, Chandigarh, or a specific corridor?`;
  }
  const next = getNextQuestion(state, "en");
  return next
    ? `Thanks, ${first}. Let's find the right space for you. ${next}`
    : `Thanks, ${first}. Let's find the right space for you.`;
}

export default async (request) => {
  const headers = cors(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);

  const rate = allow(request);
  if (!rate.allowed) {
    console.warn("App rate limit hit", { remaining: rate.remaining, count: rate.count, limit: rate.limit });
    return json({
      error: "I'm getting a lot of messages right now. Please wait a few seconds and try again."
    }, 429, headers);
  }

  let isStream = false;
  let currentState = {};
  let properties = [];
  let sources = [];
  let intent = "general";
  const started = Date.now();

  try {
    const body = await request.json();
    const question = normalize(body.question);
    const fullHistory = Array.isArray(body.history) ? body.history : [];
    const history = fullHistory.slice(-8);
    const sessionId = body.sessionId || "unknown-session";
    const language = detectLanguage(question);
    isStream = body.stream === true;
    currentState = extractSlots(question, body.leadState || {});
    currentState = parsePropertyQuery(question, currentState);
    currentState.category = canonicalCategory(currentState) || currentState.category;
    currentState = sanitizedLeadState(currentState);
    if (body.contactDetails && typeof body.contactDetails === "object") {
      const contactVal = validateContactDetails(body.contactDetails);
      if (!contactVal.valid && body.contactContinue) {
        return json({ error: Object.values(contactVal.errors)[0] || "Invalid contact details.", errors: contactVal.errors }, 400, headers);
      }
      if (contactVal.valid) {
        currentState.name = contactVal.normalized.name;
        currentState.phone = contactVal.normalized.phone;
        currentState.email = contactVal.normalized.email;
        currentState.company = contactVal.normalized.company;
        currentState.contactCaptured = true;
      }
    }
    if (Array.isArray(body.rejectedProperties) && body.rejectedProperties.length) {
      currentState.rejectedProperties = body.rejectedProperties;
      currentState.rejectedPropertyIds = body.rejectedProperties;
    } else if (Array.isArray(body.leadState?.rejectedPropertyIds)) {
      currentState.rejectedProperties = body.leadState.rejectedPropertyIds;
      currentState.rejectedPropertyIds = body.leadState.rejectedPropertyIds;
    }
    if (body.likedProperty && typeof body.likedProperty === "object") {
      currentState.likedProperty = body.likedProperty;
    } else if (body.leadState?.likedProperty) {
      currentState.likedProperty = body.leadState.likedProperty;
    }
    intent = detectIntent(question);
    // Keep inquiry intent once we have any leasing slots
    if (intent === "general" && (currentState.officeType || currentState.location || currentState.teamSize || currentState.budget || body.contactContinue)) {
      intent = "property_inquiry";
    }
    const extra = () => ({ currentState, properties, sources, intent });

    console.log("Chat request", {
      sessionId,
      intent,
      stage: getQualificationStage(currentState),
      question: question.slice(0, 120),
      known: summarizeLeadState(currentState)
    });

    if (!question) {
      return replyText("Please tell me what kind of space you are looking for.", extra(), headers, isStream);
    }
    if (question.length > 1000) {
      return replyText(STREAM_ERROR_FALLBACK, extra(), headers, isStream);
    }
    if (isOffTopicQuery(question)) {
      return replyText(offTopicReply(language), extra(), headers, isStream);
    }

    if (body.contactContinue) {
      const contactVal = validateContactDetails(currentState);
      if (!contactVal.valid) {
        return json({ error: Object.values(contactVal.errors)[0] || "Invalid contact details.", errors: contactVal.errors }, 400, headers);
      }
      currentState.name = contactVal.normalized.name;
      currentState.phone = contactVal.normalized.phone;
      currentState.email = contactVal.normalized.email;
      currentState.company = contactVal.normalized.company;
      currentState.contactCaptured = true;
      persistLeadRecord({
        sessionId,
        currentState,
        intent: "property_inquiry",
        language,
        history: [...fullHistory, { role: "user", content: "I've shared my details." }],
        extra: { rejectedProperties: currentState.rejectedProperties || [], source: "website_ai_assistant" }
      });
      return replyText(continueAfterContactReply(currentState), extra(), headers, isStream);
    }

    if (!isChatConfigured()) {
      const reply = language === "hi" || language === "hinglish"
        ? "Assistant abhi configure nahi hai. Kripya +91 76965 10579 par call karein."
        : "The assistant is not configured yet. Please call +91 76965 10579 or email cityhub.leasing@gmail.com.";
      return replyText(reply, extra(), headers, isStream);
    }

    const database = tryDb();
    const transcriptForSave = [...fullHistory, { role: "user", content: question }];
    if (hasContact(currentState) || intent === "site_visit" || intent === "handoff" || getQualificationStage(currentState) >= 7) {
      persistLeadRecord({
        sessionId,
        currentState,
        intent,
        language,
        history: transcriptForSave,
        extra: { rejectedProperties: currentState.rejectedProperties || [] }
      });
    }

    if (database) {
      const payload = {
        lastActive: new Date().toISOString(),
        language,
        leadState: currentState,
        intent,
        likedProperty: currentState.likedProperty || null
      };
      try {
        payload.messageCount = admin.firestore.FieldValue.increment(1);
      } catch {
        payload.messageCount = 1;
      }
      database.collection("chat_sessions").doc(sessionId).set(payload, { merge: true }).catch(error => console.error("Firestore session tracking failed:", error.message));
    }

    if (intent === "handoff") {
      persistLeadRecord({
        sessionId,
        currentState,
        intent: "handoff",
        language,
        history: transcriptForSave,
        extra: {
          source: "website_ai_assistant",
          handoffRequested: true,
          rejectedProperties: currentState.rejectedProperties || [],
          fullTranscript: transcriptForSave
        }
      });
      notifyAdmin(currentState, sessionId);
      return replyText(HANDOFF_REASSURANCE, extra(), headers, isStream);
    }

    let nextQuestion = null;
    let matchedInventory = [];
    if (intent === "property_inquiry" || intent === "site_visit" || currentState.officeType || currentState.location || currentState.budget) {
      nextQuestion = getNextQuestion(currentState, language);
      try {
        matchedInventory = await searchProperties(currentState, {
          question,
          excludeIds: Array.isArray(body.excludeIds) ? body.excludeIds : (currentState.rejectedPropertyIds || []),
          count: 4
        }) || [];
        const isExplicitPropertyQuery = /\b(property|properties|option|options|available|show me|list|photos|images|pricing|units|space|cabins?|desks?)\b/i.test(question);
        const hasSufficientContext = getQualificationStage(currentState) >= 3;
        if (hasContact(currentState) && (hasSufficientContext || isExplicitPropertyQuery)) {
          properties = matchedInventory.slice(0, 3);
        }
      } catch (error) {
        console.error("Property match skipped", error.message);
        matchedInventory = [];
        properties = [];
      }
    }

    if (needsContact(currentState) && (intent === "property_inquiry" || currentState.officeType)) {
      return replyText(nextQuestion || CONTACT_PROMPT, extra(), headers, isStream);
    }

    // Qualification is complete. Keep this transition deterministic so the UI
    // can present the existing category listing routes instead of ending the chat.
    if (getQualificationStage(currentState) >= 7) {
      return replyText(qualificationReply(currentState, language), extra(), headers, isStream);
    }

    if (isCasual(question) && !nextQuestion && !currentState.officeType) {
      return replyText(casualReply(question, language), extra(), headers, isStream);
    }

    if (looksUnsafe(question)) {
      return replyText(fallback, extra(), headers, isStream);
    }

    const activeCategory = canonicalCategory(currentState);
    let context = "";
    const matches = await retrieve(question, 5, { leadState: currentState, category: activeCategory });
    if (matches.length) {
      sources = [...new Map(matches.map(({ title, url }) => [url, { title, url }])).values()]
        .filter(source => {
          const url = String(source.url || "").toLowerCase();
          const title = String(source.title || "").toLowerCase();
          if (activeCategory === "Office" || activeCategory === "Coworking") {
            return !url.includes("warehouse-for-rent") && !url.includes("showroom-for-rent") && !title.includes("warehouses for rent") && !title.includes("showrooms for rent");
          }
          if (activeCategory === "Warehouse") {
            return !url.includes("office-space") && !url.includes("showroom-for-rent") && !title.includes("office space") && !title.includes("showrooms for rent");
          }
          if (activeCategory === "Showroom") {
            return !url.includes("office-space") && !url.includes("warehouse-for-rent") && !title.includes("office space") && !title.includes("warehouses for rent");
          }
          return true;
        })
        .slice(0, 3);
      context = matches.slice(0, 3).map((item, index) =>
        `[${index + 1}] ${item.title}\nURL: ${item.url}\n${String(item.text || "").slice(0, 600)}`
      ).join("\n\n");
    }

    const instructions = buildInstructions({
      language,
      currentState,
      nextQuestion,
      properties: matchedInventory.length ? matchedInventory : properties,
      context,
      intent
    });
    const messages = [
      { role: "system", content: instructions },
      ...historyMessages(history, body.question),
      { role: "user", content: question }
    ];
    const fallbackText = consultantFallback({
      question, language, currentState, properties: matchedInventory.length ? matchedInventory : properties, context, intent
    });
    const response = await completeChat({
      messages,
      isStream,
      extra: extra(),
      headers,
      fallbackText
    });
    console.log("Chat request done", {
      sessionId,
      ms: Date.now() - started,
      stage: getQualificationStage(currentState)
    });
    return response;
  } catch (error) {
    console.error("CityHub chat error:", error.message);
    return replyText(STREAM_ERROR_FALLBACK, { currentState, properties, sources, intent }, headers, isStream);
  }
};
