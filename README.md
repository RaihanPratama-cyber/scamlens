# ScamLens — On-device-first scam detector

Paste a suspicious message or link. ScamLens tells you if it is a scam —
and shows you **which model checked it and where it ran**.

Built for **#BuildHybridAI 2026** (Google / Firebase, Devpost) with
Firebase AI Logic. Platform: **Web (Chrome)**.

## The hybrid idea (one sentence)

Your private message is triaged **on your device** by Gemini Nano 4 and
only ever goes to the cloud when **you** tap "Deep analysis" — or when
your device has no on-device model at all.

## Three tiers

| Tier | What runs | When | Privacy |
|---|---|---|---|
| 0 — Rule layer (`src/rules.js`) | Deterministic Indonesian scam keywords + URL checks, fully offline | Always, instantly | Nothing leaves the device |
| 1 — On-device (`InferenceMode.ONLY_ON_DEVICE`) | Gemini Nano 4 via Firebase AI Logic | Rule score uncertain, or rules already conclusive (explanation only) | Nothing leaves the device |
| 2 — Cloud deep analysis (`InferenceMode.ONLY_IN_CLOUD`) | Gemini 3.5 Flash-Lite via Firebase AI Logic | Only when the user taps "Deep analysis" | Sent to the cloud with explicit consent |
| Fallback — Hybrid (`InferenceMode.PREFER_ON_DEVICE`) | Nano when available, cloud Gemini when not | Uncertain message on a device without Nano | Sent only because no on-device model exists |

The routing logic lives in `src/router.js` and is fully unit-tested.
The result card always shows the path, the model used, and the privacy note.

## Run locally

```bash
npm test          # 31 tests: rules + router + mock AI (no dependencies, node --test)
npm start         # serves the app on http://localhost:3000
```

Open it in **Chrome Desktop v139+**. For on-device inference, enable
`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and check
`await LanguageModel.availability()` in DevTools. Without Nano, the app
falls back to the cloud (hybrid) or to rule verdicts (offline).

## Connect Firebase (enables the AI tiers)

1. Create a project at console.firebase.google.com.
2. Enable **Firebase AI Logic** (Gemini Developer API backend) and **App Check**.
3. `cp firebase-config.example.js firebase-config.js` and paste your web app config.
4. Deploy, e.g. `firebase deploy` (Firebase Hosting) or any static host.

Without `firebase-config.js` the app runs in **demo mode**: the local
mock AI (`src/mock-ai.js`) answers with the same result shape as the
real tiers — verdict, explanation, tactics, safe reply — so the full
flow can be demoed and tested without a key. Every mock answer is
labelled **"Demo AI (local mock) — not Gemini"** in the UI. It never
pretends the AI ran. Demo mode is for development only: the final video
must show the live Firebase path.

## Rules (honest limits)

- The rule layer is a triage heuristic ported from the PesanAman
  classifier (GenHacks pack, 234-message synthetic dataset). It is not
  the PesanAman ML model — no sklearn in the browser.
- Gemini Nano is a small model: keep prompts short, expect short answers.
  On-device inference only supports single-turn text generation, not chat.
- Cloud model: `gemini-3.5-flash-lite` in `src/ai.js` (corrected 27 Nov
  2026 — `gemini-2.5-flash` is deprecated; Google auto-routes 2.5 Flash
  to 3.5 Flash-Lite from 1 Dec 2026). Passed via `inCloudParams`.
- ScamLens is a screening aid, not a legal verdict. When in doubt: don't
  click, don't transfer, verify through the official app or website.

## Files

```
index.html                    # UI (no build step)
styles.css                    # clean minimal UI
app.js                        # UI wiring, history (localStorage only)
src/rules.js                  # Tier 0: keyword + URL rule layer
src/router.js                 # hybrid routing decision (tested)
src/prompts.js                # Nano + cloud prompts (JSON output contract)
src/ai.js                     # Firebase AI Logic wrapper (lazy import)
src/mock-ai.js                # local demo/mock AI, same interface as ai.js
firebase-config.example.js    # placeholder config — never commit real keys
data/examples.json            # 11 synthetic examples (7 scam, 4 legit)
tests/test_rules_router.mjs   # node:test suite (rules + router)
tests/test_mock_ai.mjs        # node:test suite (mock AI + JSON extractor)
```
