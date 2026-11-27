// ScamLens — UI wiring. No build step: open index.html in Chrome.
// Flow: paste message -> rule layer (instant, offline) -> router picks
// the AI tier -> result card shows verdict + WHICH model ran where.
// History is stored in localStorage only, never sent anywhere.

import { scoreMessage } from "./src/rules.js";
import { decideRoute } from "./src/router.js";
import { initAI, isConfigured, isNanoAvailable, analyzeOnDevice, analyzeHybrid, analyzeCloudDeep } from "./src/ai.js";
import { mockAnalyzeOnDevice, mockAnalyzeHybrid, mockAnalyzeCloudDeep } from "./src/mock-ai.js";
import examples from "./data/examples.json" with { type: "json" };

const $ = (id) => document.getElementById(id);

const state = {
  nanoAvailable: false,
  lastResult: null,
};

function levelClass(level) {
  return { HIGH: "high", MEDIUM: "medium", LOW: "low" }[level] || "low";
}

function renderResult({ rule, route, aiResult }) {
  const card = $("result");
  card.hidden = false;
  const verdict = aiResult?.risk || rule.level;
  $("verdict").textContent = verdict === "HIGH" ? "Likely a scam" : verdict === "MEDIUM" ? "Suspicious" : "Looks safe";
  $("verdict").className = `verdict ${levelClass(verdict)}`;
  $("score").textContent = `Rule score ${rule.score} · ${rule.categoryLabel || "no category"} · ${route.model}`;
  $("explanation").textContent = aiResult?.explanation || defaultExplanation(rule);
  const action = aiResult?.action || defaultAction(rule);
  $("action").textContent = action;
  $("privacy").textContent = route.privacyNote;
  $("route").textContent = `Path: ${route.path} — ${route.reason}`;

  const tactics = $("tactics");
  tactics.innerHTML = "";
  if (aiResult?.tactics?.length) {
    for (const t of aiResult.tactics) {
      const li = document.createElement("li");
      li.textContent = t;
      tactics.appendChild(li);
    }
  }
  const reply = $("safe-reply");
  if (aiResult?.safeReply) {
    reply.hidden = false;
    $("safe-reply-text").textContent = aiResult.safeReply;
  } else {
    reply.hidden = true;
  }
  saveHistory({ text: $("input").value.slice(0, 200), verdict, model: route.model, at: new Date().toISOString() });
  renderHistory();
}

function defaultExplanation(rule) {
  if (rule.level === "HIGH") return `The rule layer found strong scam signals (${rule.categoryLabel || "suspicious patterns"}). Do not click, do not transfer money.`;
  if (rule.level === "MEDIUM") return "Some suspicious signals, but not conclusive. Check the sender through an official channel.";
  return "No scam signals found in the text. Stay alert anyway: a clean text does not guarantee a safe link.";
}

function defaultAction(rule) {
  if (rule.level === "HIGH") return "Do not click any link, do not reply, block and report the sender.";
  if (rule.level === "MEDIUM") return "Verify through the official app or website, never through the link in the message.";
  return "No action needed, but never share OTPs or PINs with anyone.";
}

function saveHistory(entry) {
  try {
    const items = JSON.parse(localStorage.getItem("scamlens-history") || "[]");
    items.unshift(entry);
    localStorage.setItem("scamlens-history", JSON.stringify(items.slice(0, 20)));
  } catch { /* private mode: history is optional */ }
}

function renderHistory() {
  const list = $("history-list");
  list.innerHTML = "";
  let items = [];
  try { items = JSON.parse(localStorage.getItem("scamlens-history") || "[]"); } catch { /* ignore */ }
  for (const item of items.slice(0, 5)) {
    const li = document.createElement("li");
    li.textContent = `${item.verdict} — ${item.text.slice(0, 60)}${item.text.length > 60 ? "…" : ""}`;
    list.appendChild(li);
  }
  $("history").hidden = items.length === 0;
}

async function analyze(deep = false) {
  const text = $("input").value.trim();
  if (!text) {
    $("result").hidden = true;
    alert("Paste a suspicious message or link first.");
    return;
  }
  $("status").textContent = "Checking with the local rule layer…";
  const rule = scoreMessage(text);
  const route = decideRoute({
    rule,
    nanoAvailable: state.nanoAvailable,
    online: navigator.onLine,
    deepRequested: deep,
  });

  let aiResult = null;
  if (route.path === "rules-only") {
    $("status").textContent = "Verdict from the local rule layer (no AI call).";
  } else if (isConfigured()) {
    try {
      $("status").textContent = `Asking ${route.model}…`;
      if (route.path === "on-device") aiResult = await analyzeOnDevice(text);
      else if (route.path === "hybrid-fallback") aiResult = await analyzeHybrid(text);
      else if (route.path === "cloud-deep") aiResult = await analyzeCloudDeep(text, rule);
      $("status").textContent = `Answered by ${aiResult.modelUsed}.`;
    } catch (err) {
      $("status").textContent = `AI call failed (${err.message}). Showing the rule verdict instead.`;
    }
  } else {
    // Demo mode: no Firebase key yet. The LOCAL MOCK (src/mock-ai.js)
    // answers with the same result shape so the full flow — verdict,
    // explanation, tactics, safe reply — can be demoed and tested.
    // It is always labelled "Demo AI (local mock) — not Gemini".
    try {
      $("status").textContent = "Demo mode: answering with the local mock AI (no Firebase key yet).";
      if (route.path === "on-device") aiResult = await mockAnalyzeOnDevice(text);
      else if (route.path === "hybrid-fallback") aiResult = await mockAnalyzeHybrid(text);
      else if (route.path === "cloud-deep") aiResult = await mockAnalyzeCloudDeep(text, rule);
      $("status").textContent = `Answered by ${aiResult.modelUsed}. Connect Firebase to use real Gemini Nano 4 + Gemini 3.5 Flash-Lite.`;
    } catch (err) {
      $("status").textContent = `Demo AI failed (${err.message}). Showing the rule verdict instead.`;
    }
  }
  renderResult({ rule, route, aiResult });
}

async function boot() {
  // Example chips
  const chips = $("examples");
  for (const ex of examples) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = ex.id.replace(/-/g, " ");
    b.addEventListener("click", () => { $("input").value = ex.text; analyze(false); });
    chips.appendChild(b);
  }
  $("analyze").addEventListener("click", () => analyze(false));
  $("deep").addEventListener("click", () => analyze(true));
  $("clear-history").addEventListener("click", () => {
    localStorage.removeItem("scamlens-history");
    renderHistory();
  });

  state.nanoAvailable = await isNanoAvailable();
  $("nano-status").textContent = state.nanoAvailable
    ? "Gemini Nano 4 is available in this Chrome (on-device ready)."
    : "Gemini Nano 4 is not available in this Chrome — enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input, or the app will fall back to the cloud.";
  $("online-status").textContent = navigator.onLine ? "Online" : "Offline — rule layer + on-device only.";

  try {
    const { default: config } = await import("./firebase-config.js");
    await initAI(config);
    $("firebase-status").textContent = "Firebase AI Logic connected.";
  } catch {
    $("firebase-status").textContent = "Demo mode: no firebase-config.js — the local mock AI answers instead of Gemini. See scamlens/README.md to connect Firebase.";
  }
  renderHistory();
}

document.addEventListener("DOMContentLoaded", boot);
