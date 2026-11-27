// ScamLens — tests for the rule layer and the hybrid router.
// Run: npm test   (node --test, no dependencies)
// The rule layer is the only part that can be fully tested without
// Chrome + Firebase, so it carries the quality bar for this pack:
// every example in data/examples.json must score its expected level.

import test from "node:test";
import assert from "node:assert/strict";
import { scoreMessage, extractUrls, checkUrl } from "../src/rules.js";
import { decideRoute, ROUTES } from "../src/router.js";
import examples from "../data/examples.json" with { type: "json" };

test("all bundled examples score their expected level", () => {
  for (const ex of examples) {
    const r = scoreMessage(ex.text);
    assert.equal(r.level, ex.expectedLevel, `${ex.id}: expected ${ex.expectedLevel}, got ${r.level} (score ${r.score})`);
    if (ex.expectedCategory) {
      assert.equal(r.category, ex.expectedCategory, `${ex.id}: expected category ${ex.expectedCategory}, got ${r.category}`);
    }
  }
});

test("job scam with shortener scores HIGH", () => {
  const r = scoreMessage("Selamat! Anda lolos seleksi kerja admin online gaji 8 juta per hari, hubungi WA 0812xxxx klik bit.ly/daftar-kerja");
  assert.equal(r.level, "HIGH");
  assert.equal(r.category, "job");
  assert.ok(r.urlFlags.includes("shortener"));
});

test("investment scam scores HIGH", () => {
  const r = scoreMessage("Investasi crypto profit 30% per hari dijamin aman, modal 500 ribu jadi 5 juta, daftar sekarang");
  assert.equal(r.level, "HIGH");
  assert.equal(r.category, "investment");
});

test("APK link with .apk and shortener scores HIGH", () => {
  const r = scoreMessage("Unduh aplikasi kurir terbaru, klik tautan ini untuk lacak paket Anda: s.id/paket-apk.apk");
  assert.equal(r.level, "HIGH");
  assert.ok(r.urlFlags.includes("apk-file"));
});

test("giveaway scam scores HIGH", () => {
  const r = scoreMessage("Selamat! Anda memenangkan undian berhadiah iPhone 15, klaim hadiah sebelum berakhir klik link ini");
  assert.equal(r.level, "HIGH");
  assert.equal(r.category, "giveaway");
});

test("family emergency scam scores HIGH", () => {
  const r = scoreMessage("Nak, mama ganti nomor, tolong transfer 2 juta ke rekening ini, mama butuh cepat");
  assert.equal(r.level, "HIGH");
  assert.equal(r.category, "family");
});

test("fake loan scores HIGH", () => {
  const r = scoreMessage("Pinjaman online cair 10 juta tanpa jaminan, bunga 0%, proses 5 menit, klik link");
  assert.equal(r.level, "HIGH");
  assert.equal(r.category, "loan");
});

test("bank impersonation scores HIGH", () => {
  const r = scoreMessage("Yth nasabah BCA, akun Anda diblokir, segera verifikasi data dengan klik tautan berikut");
  assert.equal(r.level, "HIGH");
  assert.equal(r.category, "impersonation");
});

test("legit bank scam warning is LOW, not HIGH", () => {
  const r = scoreMessage("Waspada penipuan! Bank tidak pernah meminta OTP atau PIN Anda. Jangan klik tautan dari nomor tidak dikenal.");
  assert.equal(r.level, "LOW");
  assert.ok(r.warningHits.length >= 2);
});

test("legit campus announcement is LOW", () => {
  const r = scoreMessage("Pengumuman: jadwal UAS Workshop ML for IoT pertemuan 14, silakan cek Google Classroom");
  assert.equal(r.level, "LOW");
  assert.equal(r.score, 0);
});

test("legit transfer notification is LOW", () => {
  const r = scoreMessage("Transfer masuk Rp500.000 dari Budi Santoso");
  assert.equal(r.level, "LOW");
});

test("legit e-commerce shipping notice is LOW", () => {
  const r = scoreMessage("Pesanan Anda sudah dikirim, cek resi di aplikasi Shopee");
  assert.equal(r.level, "LOW");
});

test("URL checker flags shortener, apk, ip literal and punycode", () => {
  assert.deepEqual(checkUrl("https://bit.ly/abc"), ["shortener"]);
  assert.ok(checkUrl("https://example.com/app.apk").includes("apk-file"));
  assert.ok(checkUrl("http://192.168.1.10/login").includes("ip-literal"));
  assert.ok(checkUrl("https://xn--bca-bank.com/login").includes("punycode"));
  assert.deepEqual(checkUrl("https://www.google.com/search"), []);
});

test("extractUrls finds links and dedupes", () => {
  const urls = extractUrls("cek https://bit.ly/a dan https://bit.ly/a lalu www.google.com");
  assert.equal(urls.length, 2);
});

// --- Router ---

const highRule = { score: 0.95, level: "HIGH", category: "job" };
const midRule = { score: 0.5, level: "MEDIUM", category: "giveaway" };
const lowRule = { score: 0.1, level: "LOW", category: null };

test("router: offline + no Nano -> rules-only, nothing leaves device", () => {
  const d = decideRoute({ rule: midRule, nanoAvailable: false, online: false, deepRequested: false });
  assert.equal(d.path, ROUTES.RULES_ONLY);
  assert.match(d.privacyNote, /Nothing left the device/);
});

test("router: certain rules + Nano -> on-device explanation only", () => {
  const d = decideRoute({ rule: highRule, nanoAvailable: true, online: true, deepRequested: false });
  assert.equal(d.path, ROUTES.ON_DEVICE);
  assert.equal(d.model, "Gemini Nano 4 (on-device)");
});

test("router: certain rules + no Nano -> rules-only, no cloud call", () => {
  const d = decideRoute({ rule: highRule, nanoAvailable: false, online: true, deepRequested: false });
  assert.equal(d.path, ROUTES.RULES_ONLY);
});

test("router: uncertain + Nano -> on-device triage", () => {
  const d = decideRoute({ rule: midRule, nanoAvailable: true, online: true, deepRequested: false });
  assert.equal(d.path, ROUTES.ON_DEVICE);
});

test("router: uncertain + no Nano + online -> hybrid fallback to cloud", () => {
  const d = decideRoute({ rule: midRule, nanoAvailable: false, online: true, deepRequested: false });
  assert.equal(d.path, ROUTES.HYBRID_FALLBACK);
  assert.equal(d.mode, "prefer_on_device");
});

test("router: deep analysis requested -> cloud, only with consent", () => {
  const d = decideRoute({ rule: lowRule, nanoAvailable: true, online: true, deepRequested: true });
  assert.equal(d.path, ROUTES.CLOUD_DEEP);
  assert.match(d.privacyNote, /only because the user asked/);
});

test("router: deep analysis requested but offline -> on-device instead", () => {
  const d = decideRoute({ rule: lowRule, nanoAvailable: true, online: false, deepRequested: true });
  assert.equal(d.path, ROUTES.ON_DEVICE);
});

test("router: harmless + Nano -> quick on-device check", () => {
  const d = decideRoute({ rule: lowRule, nanoAvailable: true, online: true, deepRequested: false });
  assert.equal(d.path, ROUTES.ON_DEVICE);
});
