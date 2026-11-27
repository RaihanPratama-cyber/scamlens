// ScamLens — tests for the local mock AI provider (src/mock-ai.js)
// and the JSON extractor in src/ai.js.
// The mock must behave like the real Firebase AI Logic wrapper:
// same function shapes, same result fields, verdict always agreeing
// with the deterministic rule layer. Run: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { mockAnalyzeOnDevice, mockAnalyzeHybrid, mockAnalyzeCloudDeep } from "../src/mock-ai.js";
import { extractJson } from "../src/ai.js";

const JOB_SCAM = "Selamat! Anda lolos seleksi kerja admin online gaji 8 juta per hari, hubungi WA 0812xxxx klik bit.ly/daftar-kerja";
const LEGIT = "Halo, paket Anda sudah sampai di agen JNE terdekat. Silakan ambil dengan menunjukkan KTP.";

test("mock on-device: job scam returns HIGH with mock label", async () => {
  const r = await mockAnalyzeOnDevice(JOB_SCAM);
  assert.equal(r.risk, "HIGH");
  assert.equal(r.category, "job");
  assert.equal(r.tier, "on-device");
  assert.match(r.modelUsed, /local mock/);
  assert.match(r.modelUsed, /not Gemini/);
  assert.equal(r.mock, true);
  assert.ok(r.explanation.length > 20);
  assert.ok(r.action.length > 10);
});

test("mock on-device: legit message returns LOW", async () => {
  const r = await mockAnalyzeOnDevice(LEGIT);
  assert.equal(r.risk, "LOW");
});

test("mock hybrid: same shape as on-device, tier hybrid-fallback", async () => {
  const r = await mockAnalyzeHybrid(JOB_SCAM);
  assert.equal(r.risk, "HIGH");
  assert.equal(r.tier, "hybrid-fallback");
  assert.equal(r.mock, true);
  assert.match(r.modelUsed, /local mock/);
});

test("mock cloud deep: scam returns tactics + safe reply", async () => {
  const r = await mockAnalyzeCloudDeep(JOB_SCAM);
  assert.equal(r.risk, "HIGH");
  assert.equal(r.tier, "cloud-deep");
  assert.ok(Array.isArray(r.tactics));
  assert.ok(r.tactics.length >= 1, "expected at least one tactic");
  assert.ok(r.tactics.every((t) => t.length <= 80));
  assert.ok(r.safeReply && r.safeReply.length > 20);
  assert.equal(r.mock, true);
});

test("mock cloud deep: legit message returns no tactics and no safe reply", async () => {
  const r = await mockAnalyzeCloudDeep(LEGIT);
  assert.equal(r.risk, "LOW");
  assert.deepEqual(r.tactics, []);
  assert.equal(r.safeReply, null);
});

test("mock verdicts always agree with the rule layer", async () => {
  const { scoreMessage } = await import("../src/rules.js");
  const samples = [
    "Investasi crypto dijamin untung 200% per bulan, daftar sekarang di bit.ly/cuan-cepat",
    "Selamat Anda menang undian berhadiah 50 juta, klik link ini untuk klaim",
    "Mama ganti nomor, tolong transfer 2 juta ke rekening ini sekarang juga",
    "Rapat kelompok besok jam 10 di lab 3, jangan lupa bawa laptop.",
  ];
  for (const text of samples) {
    const rule = scoreMessage(text);
    const r = await mockAnalyzeOnDevice(text);
    assert.equal(r.risk, rule.level, `verdict must match rule layer for: ${text.slice(0, 40)}`);
  }
});

test("extractJson: parses a bare JSON object", () => {
  const out = extractJson('{"risk":"HIGH","explanation":"x"}');
  assert.equal(out.risk, "HIGH");
});

test("extractJson: tolerates markdown fences and surrounding prose", () => {
  const out = extractJson('Here is the result:\n```json\n{"risk":"LOW","explanation":"ok"}\n```\nDone.');
  assert.equal(out.risk, "LOW");
});

test("extractJson: throws when there is no JSON object", () => {
  assert.throws(() => extractJson("no json here at all"), /did not return JSON/);
});
