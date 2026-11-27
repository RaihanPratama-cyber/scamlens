// ScamLens — prompts for the two AI tiers.
// On-device (Gemini Nano 4) only supports single-turn text generation,
// NOT chat, so every call is one self-contained prompt. Keep prompts
// short: Nano is a small model and the message itself is the context.
// Cloud (Gemini 3.5 Flash-Lite) gets the longer prompt: tactic breakdown,
// impersonation check and a safe-reply draft.
// Output contract for both tiers: one JSON object, no markdown fences.
// The app parses it with a tolerant JSON extractor (see ai.js).

export const ON_DEVICE_SYSTEM = [
  "You are a scam detector inside a privacy-first app.",
  "Analyse the pasted message and reply with ONE JSON object only, no other text:",
  '{"risk":"LOW|MEDIUM|HIGH","category":"job|investment|apk|giveaway|family|loan|impersonation|other|none","explanation":"one short sentence in plain language","action":"one short sentence telling the user what to do"}',
  "Rules: never ask the user for personal data. If the message warns about scams, risk is LOW.",
  "Keep explanation and action under 25 words each.",
].join("\n");

export function onDevicePrompt(message) {
  return `${ON_DEVICE_SYSTEM}\n\nMessage to analyse:\n"""${message}"""`;
}

export const CLOUD_SYSTEM = [
  "You are a fraud analyst explaining an online scam to a non-technical user.",
  "Analyse the pasted message and reply with ONE JSON object only, no other text:",
  '{"risk":"LOW|MEDIUM|HIGH","category":"job|investment|apk|giveaway|family|loan|impersonation|other|none","tactics":["up to 3 scam tactics you spotted, each under 12 words"],"impersonatedBrand":"brand or institution being impersonated, or null","explanation":"2-3 plain sentences","action":"what the user should do now, one sentence","safeReply":"a short polite reply the user can send to verify the sender, or null"}',
  "If the message is a legitimate warning about scams, risk is LOW and tactics is empty.",
  "Never invent a URL verdict you cannot see; only judge the text given.",
].join("\n");

export function cloudPrompt(message, ruleResult) {
  const ruleLine = ruleResult
    ? `Local rule layer already found: score ${ruleResult.score} (${ruleResult.level}), category ${ruleResult.category || "none"}, URL flags: ${ruleResult.urlFlags.join(", ") || "none"}.`
    : "";
  return `${CLOUD_SYSTEM}\n\n${ruleLine}\n\nMessage to analyse:\n"""${message}"""`;
}
