// ScamLens — Firebase AI Logic integration.
// ALL AI inference in this app goes through Firebase AI Logic.
// No other model API is ever called directly (a hard rule of #BuildHybridAI).
//
// Verified against the official Firebase docs
// (firebase.google.com/docs/ai-logic/hybrid/web/get-started and
// firebase.blog/posts/2025/10/understand-ai-logic-hybrid-inference):
//   import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";
//   const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
//   const model = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE });
// Modes: ONLY_ON_DEVICE, ONLY_IN_CLOUD, PREFER_ON_DEVICE, PREFER_IN_CLOUD.
// On-device inference only supports single-turn text generation (not chat)
// and only runs on Chrome Desktop v139+ with the Prompt API flag enabled.
// Cloud model: pass it via inCloudParams (NOT a top-level `model` key —
// that was the old API). Cloud model name MUST be checked against the
// Firebase AI Logic models list at build time.
//   CORRECTED 27 Nov 2026: "gemini-2.5-flash" is DEPRECATED — Google's
//   Nov 2026 release notes say 2.5 Flash requests are auto-routed to
//   gemini-3.5-flash-lite from 1 Dec 2026, and new projects must use a
//   current model. This app now uses "gemini-3.5-flash-lite" directly.
//   (Firebase docs: default cloud fallback is gemini-3.5-flash-lite
//   from JS SDK v13.0.0.)
// getGenerativeModel MUST be called after/on a user interaction (e.g. a
// button click) — a prerequisite for inferenceMode. ScamLens only calls
// it inside analyze*(), which run from click handlers. Do not move the
// call into initAI()/boot.
// Which tier actually ran is read from result.response.inferenceSource
// (JS SDK v12.5.0+): "ON_DEVICE" or "IN_CLOUD".
//
// The Firebase SDK is loaded lazily (dynamic import) so the app still
// works — rules only — when Firebase is not configured or the SDK
// cannot load. Demo mode is honest: the UI always shows which tier
// actually ran, and never pretends the AI ran when it did not.

import { onDevicePrompt, cloudPrompt } from "./prompts.js";

const CLOUD_MODEL = "gemini-3.5-flash-lite"; // current model, verified 27 Nov 2026 (see header). Do NOT revert to gemini-2.5-flash (deprecated).

let firebaseApp = null;
let ai = null;
let sdkLoaded = false;

export function isConfigured() {
  return Boolean(firebaseApp);
}

/** Initialise Firebase + AI Logic. `config` is the web app config from the Firebase console. */
export async function initAI(config) {
  if (!config || !config.apiKey || config.apiKey.includes("PASTE")) {
    throw new Error("Firebase config missing: copy firebase-config.example.js to firebase-config.js and fill it in.");
  }
  const { initializeApp } = await import("firebase/app");
  const { getAI, GoogleAIBackend } = await import("firebase/ai");
  firebaseApp = initializeApp(config);
  ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  sdkLoaded = true;
  return true;
}

/** Is Gemini Nano 4 available in this Chrome? Uses the built-in Prompt API. Safe to call anywhere. */
export async function isNanoAvailable() {
  try {
    if (typeof LanguageModel === "undefined" || !LanguageModel.availability) return false;
    const status = await LanguageModel.availability();
    return status === "available" || status === "downloadable" || status === "downloading";
  } catch {
    return false;
  }
}

async function getModel(mode) {
  if (!sdkLoaded) throw new Error("Firebase AI Logic is not initialised.");
  const { getGenerativeModel, InferenceMode } = await import("firebase/ai");
  // Hybrid modes need the cloud model name via inCloudParams; on-device-only does not.
  const options = { mode };
  if (mode !== InferenceMode.ONLY_ON_DEVICE) options.inCloudParams = { model: CLOUD_MODEL };
  return getGenerativeModel(ai, options);
}

/** Where did this response actually run? SDK v12.5.0+ reports inferenceSource. */
function sourceOf(result) {
  return result?.response?.inferenceSource || null; // "ON_DEVICE" | "IN_CLOUD" | null
}

/** Extract the first JSON object from model text (models sometimes add fences or prose). */
export function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

/** Tier 1: on-device only. Message never leaves the device. */
export async function analyzeOnDevice(message) {
  const { InferenceMode } = await import("firebase/ai");
  const model = await getModel(InferenceMode.ONLY_ON_DEVICE);
  const result = await model.generateContent(onDevicePrompt(message));
  const parsed = extractJson(result.response.text());
  return { ...parsed, tier: "on-device", modelUsed: "Gemini Nano 4 (on-device)", inferenceSource: sourceOf(result) };
}

/** Tier 1b: hybrid — Nano when available, cloud Gemini when not. */
export async function analyzeHybrid(message) {
  const { InferenceMode } = await import("firebase/ai");
  const model = await getModel(InferenceMode.PREFER_ON_DEVICE);
  const result = await model.generateContent(onDevicePrompt(message));
  const parsed = extractJson(result.response.text());
  const src = sourceOf(result);
  const used = src === "IN_CLOUD" ? "Gemini 3.5 Flash-Lite (cloud fallback)" : "Gemini Nano 4 (on-device)";
  return { ...parsed, tier: "hybrid-fallback", modelUsed: used, inferenceSource: src };
}

/** Tier 2: cloud deep analysis. Only called with the user's explicit consent (see router.js). */
export async function analyzeCloudDeep(message, ruleResult) {
  const { InferenceMode } = await import("firebase/ai");
  const model = await getModel(InferenceMode.ONLY_IN_CLOUD);
  const result = await model.generateContent(cloudPrompt(message, ruleResult));
  const parsed = extractJson(result.response.text());
  return { ...parsed, tier: "cloud-deep", modelUsed: "Gemini 3.5 Flash-Lite (cloud)", inferenceSource: sourceOf(result) };
}
