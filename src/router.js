// ScamLens — hybrid routing decision (pure logic, no Firebase calls).
// Decides WHICH inference tier handles a message and WHY.
// The routing rationale itself is the core of the #BuildHybridAI entry:
// judges score how effectively hybrid inference is used, so every
// decision must be explainable in one sentence.
//
// Tiers:
//   rules-only      — deterministic rule layer only (offline, or verdict already certain)
//   on-device       — Gemini Nano 4 via Firebase AI Logic, InferenceMode.ONLY_ON_DEVICE
//   hybrid-fallback — PREFER_ON_DEVICE: Nano when available, cloud Gemini when not
//   cloud-deep      — cloud Gemini 3.5 Flash-Lite via Firebase AI Logic, ONLY_IN_CLOUD
//
// Privacy rule of the app: a user's pasted message leaves the device
// ONLY when (a) the on-device model is unavailable, or (b) the user
// explicitly taps "Deep analysis". The router never sends anything
// to the cloud silently for a routine check.

export const ROUTES = {
  RULES_ONLY: "rules-only",
  ON_DEVICE: "on-device",
  HYBRID_FALLBACK: "hybrid-fallback",
  CLOUD_DEEP: "cloud-deep",
};

// InferenceMode values from the Firebase AI Logic JS SDK (firebase/ai).
export const INFERENCE_MODES = {
  ONLY_ON_DEVICE: "only_on_device",
  ONLY_IN_CLOUD: "only_in_cloud",
  PREFER_ON_DEVICE: "prefer_on_device",
};

export const HIGH_THRESHOLD = 0.85; // rules alone are certain enough
export const MEDIUM_THRESHOLD = 0.35; // worth an AI look

/**
 * @param {object} input
 * @param {object} input.rule        result of scoreMessage()
 * @param {boolean} input.nanoAvailable  Gemini Nano 4 ready in this Chrome
 * @param {boolean} input.online     navigator.onLine
 * @param {boolean} input.deepRequested user tapped "Deep analysis"
 * @returns {{ path, mode, model, reason, privacyNote }}
 */
export function decideRoute({ rule, nanoAvailable, online, deepRequested }) {
  // 1. Nothing to send anywhere: offline and no on-device model.
  if (!online && !nanoAvailable) {
    return {
      path: ROUTES.RULES_ONLY,
      mode: null,
      model: "rule-layer (local)",
      reason: "Offline and no on-device model: verdict comes from the local rule layer only.",
      privacyNote: "Nothing left the device.",
    };
  }

  // 2. User explicitly asked for the deepest check: cloud, with consent.
  if (deepRequested) {
    if (!online) {
      return {
        path: ROUTES.ON_DEVICE,
        mode: INFERENCE_MODES.ONLY_ON_DEVICE,
        model: "Gemini Nano 4 (on-device)",
        reason: "Deep analysis requested but offline: best available is the on-device model.",
        privacyNote: "Nothing left the device.",
      };
    }
    return {
      path: ROUTES.CLOUD_DEEP,
      mode: INFERENCE_MODES.ONLY_IN_CLOUD,
      model: "Gemini 3.5 Flash-Lite (cloud)",
      reason: "User explicitly requested deep analysis: full tactic breakdown, impersonation check and safe-reply draft.",
      privacyNote: "Message sent to the cloud only because the user asked for deep analysis.",
    };
  }

  // 3. Rules are already certain: no cloud needed, Nano only adds an explanation.
  if (rule.score >= HIGH_THRESHOLD) {
    if (nanoAvailable) {
      return {
        path: ROUTES.ON_DEVICE,
        mode: INFERENCE_MODES.ONLY_ON_DEVICE,
        model: "Gemini Nano 4 (on-device)",
        reason: "Rule score is already conclusive; the on-device model only explains it in plain language.",
        privacyNote: "Nothing left the device.",
      };
    }
    return {
      path: ROUTES.RULES_ONLY,
      mode: null,
      model: "rule-layer (local)",
      reason: "Rule score is already conclusive and no on-device model is available; no cloud call is worth the privacy cost.",
      privacyNote: "Nothing left the device.",
    };
  }

  // 4. Uncertain middle: prefer on-device, fall back to cloud when Nano is missing.
  if (rule.score >= MEDIUM_THRESHOLD) {
    if (nanoAvailable) {
      return {
        path: ROUTES.ON_DEVICE,
        mode: INFERENCE_MODES.ONLY_ON_DEVICE,
        model: "Gemini Nano 4 (on-device)",
        reason: "Uncertain message: the on-device model triages it privately first.",
        privacyNote: "Nothing left the device.",
      };
    }
    if (online) {
      return {
        path: ROUTES.HYBRID_FALLBACK,
        mode: INFERENCE_MODES.PREFER_ON_DEVICE,
        model: "Gemini Nano 4, fallback Gemini 3.5 Flash-Lite (cloud)",
        reason: "Uncertain message and no on-device model on this device, so the hybrid model falls back to the cloud.",
        privacyNote: "Sent to the cloud only because no on-device model was available.",
      };
    }
    return {
      path: ROUTES.RULES_ONLY,
      mode: null,
      model: "rule-layer (local)",
      reason: "Uncertain message, offline, no on-device model: rule verdict with a low-confidence warning.",
      privacyNote: "Nothing left the device.",
    };
  }

  // 5. Looks harmless: a fast, private on-device check is enough.
  if (nanoAvailable) {
    return {
      path: ROUTES.ON_DEVICE,
      mode: INFERENCE_MODES.ONLY_ON_DEVICE,
      model: "Gemini Nano 4 (on-device)",
      reason: "Low rule score: a quick private on-device check confirms it.",
      privacyNote: "Nothing left the device.",
    };
  }
  if (online) {
    return {
      path: ROUTES.HYBRID_FALLBACK,
      mode: INFERENCE_MODES.PREFER_ON_DEVICE,
      model: "Gemini Nano 4, fallback Gemini 3.5 Flash-Lite (cloud)",
      reason: "Low rule score but no on-device model, so the hybrid model falls back to the cloud for confirmation.",
      privacyNote: "Sent to the cloud only because no on-device model was available.",
    };
  }
  return {
    path: ROUTES.RULES_ONLY,
    mode: null,
    model: "rule-layer (local)",
    reason: "Low rule score, offline, no on-device model: rule verdict only.",
    privacyNote: "Nothing left the device.",
  };
}
