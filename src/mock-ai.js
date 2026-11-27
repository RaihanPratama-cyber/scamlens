// ScamLens — local demo/mock AI provider.
// SAME function signatures and SAME result shape as src/ai.js, but no
// Firebase, no network, no key. It derives its answers from the
// deterministic rule layer (src/rules.js) plus fixed template text, so
// the whole app — verdict, explanation, tactics, safe reply, history —
// can be demoed and tested on any machine before Firebase is connected.
//
// HONESTY RULE: every result is labelled "Demo AI (local mock) — not
// Gemini" in modelUsed, and the UI shows a "Demo mode" banner. The mock
// must NEVER be presented as a real Nano/cloud call, in the app, the
// video, or the Devpost description. It exists so the flow can be
// exercised end-to-end; the live Firebase path in src/ai.js is the
// one judges must see in the final video.

import { scoreMessage } from "./rules.js";

const CATEGORY_LABELS = {
  job: "fake job offer",
  investment: "fake investment",
  apk: "malicious APK link",
  giveaway: "fake giveaway",
  family: "family emergency impersonation",
  loan: "fake loan",
  impersonation: "brand or institution impersonation",
  other: "suspicious patterns",
  none: "no specific scam pattern",
};

function explanationFor(rule) {
  if (rule.level === "HIGH") {
    return `Demo explanation: the local rule layer found strong signals of a ${CATEGORY_LABELS[rule.category] || "scam"} (score ${rule.score}). In the live app Gemini Nano 4 writes this explanation on-device.`;
  }
  if (rule.level === "MEDIUM") {
    return `Demo explanation: some suspicious signals (${CATEGORY_LABELS[rule.category] || "unclear pattern"}, score ${rule.score}), but not conclusive. In the live app the on-device model triages this privately.`;
  }
  return "Demo explanation: no scam signals found in this text. In the live app the on-device model confirms this privately.";
}

function actionFor(rule) {
  if (rule.level === "HIGH") return "Do not click any link, do not reply, block and report the sender.";
  if (rule.level === "MEDIUM") return "Verify through the official app or website, never through the link in the message.";
  return "No action needed, but never share OTPs or PINs with anyone.";
}

function tacticsFor(rule) {
  const tactics = [];
  if (rule.urlFlags.includes("shortener")) tactics.push("Uses a shortened link to hide the real destination.");
  if (rule.urlFlags.includes("apk")) tactics.push("Pushes an APK download outside the official app store.");
  if (rule.urlFlags.includes("ip-literal")) tactics.push("Links to a bare IP address instead of a real domain.");
  if (rule.category === "job") tactics.push("Promises unrealistic pay for a simple online job.");
  if (rule.category === "investment") tactics.push("Promises guaranteed high returns on investment.");
  if (rule.category === "giveaway") tactics.push("Fake giveaway creates urgency to click now.");
  if (rule.category === "family") tactics.push("Pretends to be a family member in an emergency.");
  if (rule.category === "loan") tactics.push("Offers a loan with almost no requirements.");
  if (rule.category === "impersonation") tactics.push("Impersonates a bank, police, or courier service.");
  return tactics.slice(0, 3);
}

/** Mock of analyzeOnDevice(): same shape, tier "on-device", mock label. */
export async function mockAnalyzeOnDevice(message) {
  const rule = scoreMessage(message);
  return {
    risk: rule.level,
    category: rule.category || "none",
    explanation: explanationFor(rule),
    action: actionFor(rule),
    tier: "on-device",
    modelUsed: "Demo AI (local mock) — not Gemini",
    inferenceSource: "ON_DEVICE",
    mock: true,
  };
}

/** Mock of analyzeHybrid(): same shape, tier "hybrid-fallback", mock label. */
export async function mockAnalyzeHybrid(message) {
  const rule = scoreMessage(message);
  return {
    risk: rule.level,
    category: rule.category || "none",
    explanation: explanationFor(rule),
    action: actionFor(rule),
    tier: "hybrid-fallback",
    modelUsed: "Demo AI (local mock) — not Gemini",
    inferenceSource: "ON_DEVICE",
    mock: true,
  };
}

/** Mock of analyzeCloudDeep(): same shape, adds tactics + safe reply, mock label. */
export async function mockAnalyzeCloudDeep(message, ruleResult) {
  const rule = ruleResult || scoreMessage(message);
  return {
    risk: rule.level,
    category: rule.category || "none",
    tactics: tacticsFor(rule),
    impersonatedBrand: rule.category === "impersonation" ? "bank / courier (from message text)" : null,
    explanation: explanationFor(rule),
    action: actionFor(rule),
    safeReply: rule.level === "LOW"
      ? null
      : "Hi, I received a message claiming to be from you. Can you confirm this through your official number or app before I do anything?",
    tier: "cloud-deep",
    modelUsed: "Demo AI (local mock) — not Gemini",
    inferenceSource: "IN_CLOUD",
    mock: true,
  };
}
