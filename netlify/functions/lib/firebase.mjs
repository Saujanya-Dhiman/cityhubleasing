import admin from "firebase-admin";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "cityhubadmin";
const API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyAUI6xoxsREuNJ1XXd7VS1GD0vC0iUYynY";
const REST_BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val) {
  if (!val || typeof val !== "object") return null;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("booleanValue" in val) return Boolean(val.booleanValue);
  if ("timestampValue" in val) return val.timestampValue;
  if ("nullValue" in val) return null;
  if ("arrayValue" in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ("mapValue" in val) {
    const res = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return null;
}

const restFirestoreDb = {
  collection(colName) {
    return {
      doc(docId) {
        return {
          async set(data, options = {}) {
            const url = `${REST_BASE_URL}/${colName}/${encodeURIComponent(docId)}?key=${API_KEY}`;
            const fields = {};
            for (const [k, v] of Object.entries(data || {})) {
              if (v !== undefined) fields[k] = toFirestoreValue(v);
            }
            const res = await fetch(url, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fields })
            });
            if (!res.ok) {
              const errTxt = await res.text();
              throw new Error(`Firestore REST set error: ${res.status} ${errTxt}`);
            }
            return { id: docId };
          },
          async delete() {
            const url = `${REST_BASE_URL}/${colName}/${encodeURIComponent(docId)}?key=${API_KEY}`;
            const res = await fetch(url, { method: "DELETE" });
            return res.ok;
          },
          async get() {
            const url = `${REST_BASE_URL}/${colName}/${encodeURIComponent(docId)}?key=${API_KEY}`;
            const res = await fetch(url);
            if (res.status === 404) return { exists: false, data: () => null };
            const json = await res.json();
            const data = {};
            for (const [k, v] of Object.entries(json.fields || {})) {
              data[k] = fromFirestoreValue(v);
            }
            return { exists: true, id: docId, data: () => data };
          }
        };
      },
      async get() {
        const url = `${REST_BASE_URL}/${colName}?pageSize=300&key=${API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = await res.json();
        const docs = json.documents || [];
        const results = [];
        for (const d of docs) {
          const id = d.name.split("/").pop();
          const data = {};
          for (const [k, v] of Object.entries(d.fields || {})) {
            data[k] = fromFirestoreValue(v);
          }
          results.push({ id, data: () => data, exists: true });
        }
        return results;
      }
    };
  }
};

let database;

export function db() {
  if (database) return database;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      let clean = String(process.env.FIREBASE_SERVICE_ACCOUNT).trim();
      if (
        (clean.startsWith("'") && clean.endsWith("'")) ||
        (clean.startsWith('"') && clean.endsWith('"') && !clean.startsWith('{"'))
      ) {
        clean = clean.slice(1, -1).trim();
      }
      if (!clean.startsWith("{") && /^[A-Za-z0-9+/=]+$/.test(clean)) {
        try {
          const decoded = Buffer.from(clean, "base64").toString("utf8").trim();
          if (decoded.startsWith("{")) clean = decoded;
        } catch {}
      }
      const serviceAccount = JSON.parse(clean);
      if (serviceAccount && typeof serviceAccount === "object") {
        if (typeof serviceAccount.private_key === "string") {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        if (serviceAccount.project_id && serviceAccount.private_key) {
          if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
          database = admin.firestore();
          return database;
        }
      }
    } catch (e) {
      console.warn("Invalid FIREBASE_SERVICE_ACCOUNT, falling back to REST client:", e.message);
    }
  }
  database = restFirestoreDb;
  return database;
}

export function tryDb() {
  try {
    return db();
  } catch (error) {
    console.error("Firestore unavailable", error.message);
    return restFirestoreDb;
  }
}

