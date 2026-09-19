# CityHub website AI assistant (v2 Upgrade)

The assistant is a retrieval-augmented generation (RAG) feature equipped with dynamic slot-filling for lead capture, property search, multilingual capabilities, and memory. It answers from `knowledge_chunks` in Firestore and cites the source pages used.

## New v2 Features
- **Streaming & Memory:** Responses stream in real-time, and conversation histories are tracked in the `chat_sessions` Firestore collection to maintain context across messages.
- **Multilingual Support:** Ava understands and responds in English, Hindi, and Hinglish.
- **Lead Capture Flow:** Dynamically extracts user requirements (name, phone, email, budget, location, office type) and records them into `chat_leads`.
- **Property Search Integration:** Can perform structured queries against the `listings` collection using the `searchProperties` tool to show live properties matching user constraints.
- **Admin Panel Visibility:** The `admin.html` page now includes tabs to review AI Leads (with CSV Export) and monitor live Conversations.

## Deployment setup

1. In Netlify, set `OPENAI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `SITE_URL`, `ALLOWED_ORIGIN`, `ADMIN_EMAILS`, and `WEBHOOK_URL` (optional, for human handoff). Use `.env.example` as the variable reference; do not commit credentials.
2. Run `npm install`, then deploy. Netlify reads `netlify.toml` and runs `npm run build`, which scans every public `.html` page and Firestore listing, removes template content, chunks text, creates embeddings, and writes the knowledge collection.
3. Use a real OpenAI key (`sk-...`) **or** an OpenRouter key (`sk-or-...`). OpenRouter keys are detected automatically. For OpenRouter, set `OPENAI_CHAT_MODEL` to an active model such as `google/gemini-2.5-flash` or `meta-llama/llama-3.3-70b-instruct:free`. Embeddings are skipped on OpenRouter by default; chat still answers from website text via lexical matching. Optional: set `OPENAI_BASE_URL` if you use a compatible proxy.
3. Ensure Firestore collections `knowledge_chunks`, `chat_leads`, `chat_sessions`, and `listings` are created and secured against public client writes.
4. Give the Firebase administrator email the `ADMIN_EMAILS` value. Saving a listing in the existing admin panel calls the protected listing refresh endpoint.

## Security and behavior

- The browser never receives the OpenAI or Firebase Admin key.
- The answer function rejects injection-style requests and enforces strict safety and system role constraints.
- The widget loads efficiently and handles message streaming natively.
- Chat history (`chat_sessions`) and extracted leads (`chat_leads`) are securely stored in Firestore and viewable via the admin dashboard.

## Local checks

`npm install` then `npm run build` creates `data/knowledge-manifest.json`. With the required environment variables it also uploads embeddings to Firestore.
