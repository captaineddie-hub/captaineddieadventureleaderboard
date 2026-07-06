// Captain Eddie Adventures — global leaderboard
// Storage: Netlify Blobs (built into Netlify, no external account needed).
// GET  -> returns top 20 scores
// POST -> submits/updates a score (only kept if it beats the player's own prior best)

const { getStore } = require("@netlify/blobs");

const MAX_NAME_LEN = 16;
const MAX_SCORE = 6000;     // sanity ceiling — well above any legitimate run, blocks obvious spoofing
const MAX_DAY = 90;
const KEEP_TOP = 100;       // stored list length (function still only returns top 20 to the client)
const RETURN_TOP = 20;

function cleanName(raw) {
  if (typeof raw !== "string") return "Castaway";
  const cleaned = raw.replace(/[^a-zA-Z0-9 '\-]/g, "").trim().slice(0, MAX_NAME_LEN);
  return cleaned.length ? cleaned : "Castaway";
}

function cors(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors({ ok: true });

  const store = getStore("captain-eddie-leaderboard");
  const KEY = "scores";

  if (event.httpMethod === "GET") {
    const list = (await store.get(KEY, { type: "json" })) || [];
    return cors({ scores: list.slice(0, RETURN_TOP) });
  }

  if (event.httpMethod === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      return cors({ error: "Bad request" }, 400);
    }

    const name = cleanName(payload.name);
    const score = Math.max(0, Math.min(MAX_SCORE, Math.round(Number(payload.score) || 0)));
    const day = Math.max(1, Math.min(MAX_DAY, Math.round(Number(payload.day) || 1)));
    const missions = Math.max(0, Math.min(999, Math.round(Number(payload.missions) || 0)));
    const shells = Math.max(0, Math.min(999, Math.round(Number(payload.shells) || 0)));
    const fish = Math.max(0, Math.min(999, Math.round(Number(payload.fish) || 0)));
    const rescued = !!payload.rescued;

    if (!score) return cors({ error: "No score to submit" }, 400);

    let list = (await store.get(KEY, { type: "json" })) || [];

    // one row per name (case-insensitive) — only replace if the new score is higher
    const key = name.toLowerCase();
    const existingIdx = list.findIndex(e => e.name.toLowerCase() === key);
    const entry = { name, score, day, missions, shells, fish, rescued, ts: Date.now() };

    if (existingIdx === -1) {
      list.push(entry);
    } else if (score > list[existingIdx].score) {
      list[existingIdx] = entry;
    } else {
      // not a new personal best — still return current standings, nothing to save
      list.sort((a, b) => b.score - a.score);
      const rank = list.findIndex(e => e.name.toLowerCase() === key) + 1;
      return cors({ saved: false, rank, scores: list.slice(0, RETURN_TOP) });
    }

    list.sort((a, b) => b.score - a.score);
    list = list.slice(0, KEEP_TOP);
    await store.setJSON(KEY, list);

    const rank = list.findIndex(e => e.name.toLowerCase() === key) + 1;
    return cors({ saved: true, rank, scores: list.slice(0, RETURN_TOP) });
  }

  return cors({ error: "Method not allowed" }, 405);
};
