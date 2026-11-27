// ScamLens — deterministic rule layer (Tier 0).
// Pure JavaScript, no dependencies, runs fully offline in the browser.
// Ported and simplified from the PesanAman classifier rules
// (GenHacks starter pack, 234-message synthetic dataset, accuracy 0.957).
// This layer is a fast triage, NOT a verdict on its own: it decides
// which AI tier should look at the message next (see router.js).
// All keywords are Indonesian scam patterns; no personal data is used.

export const CATEGORIES = {
  job: {
    label: "Fake job offer",
    labelId: "Lowongan palsu",
    keywords: [
      "lolos seleksi",
      "gaji",
      "per hari",
      "hubungi wa",
      "hubungi whatsapp",
      "admin online",
      "kerja sampingan",
      "tanpa pengalaman",
    ],
  },
  investment: {
    label: "Fake investment",
    labelId: "Investasi bodong",
    keywords: [
      "profit",
      "dijamin",
      "modal",
      "daftar sekarang",
      "cuan",
      "investasi crypto",
      "lipat ganda",
      "jaminan kembali",
    ],
  },
  apk: {
    label: "Malicious APK / fake app",
    labelId: "APK phishing",
    keywords: [
      "unduh aplikasi",
      "download aplikasi",
      "install aplikasi",
      "klik tautan",
      "lacak paket",
      "update aplikasi",
    ],
  },
  giveaway: {
    label: "Fake giveaway / prize",
    labelId: "Giveaway / undian palsu",
    keywords: [
      "memenangkan undian",
      "berhadiah",
      "klaim hadiah",
      "sebelum berakhir",
      "selamat anda",
      "pemenang undian",
      "hadiah gratis",
    ],
  },
  family: {
    label: "Family emergency scam",
    labelId: "Penipuan keluarga",
    keywords: [
      "ganti nomor",
      "tolong transfer",
      "rekening ini",
      "butuh cepat",
      "mama minta",
      "papa minta",
      "anakmu kecelakaan",
    ],
  },
  loan: {
    label: "Fake loan",
    labelId: "Pinjaman palsu",
    keywords: [
      "pinjaman online",
      "tanpa jaminan",
      "bunga 0%",
      "proses 5 menit",
      "cair cepat",
      "pinjaman cair",
      "tanpa bi checking",
    ],
  },
  impersonation: {
    label: "Impersonation (bank / police / courier)",
    labelId: "Impersonasi",
    keywords: [
      "akun anda diblokir",
      "diblokir",
      "verifikasi data",
      "nasabah",
      "minta otp",
      "kirim otp",
      "kode otp",
      "minta pin",
      "berikan pin",
      "pihak kepolisian",
      "paket anda tertahan",
    ],
  },
};

// Phrases that WARN about scams. A message that warns about fraud
// (e.g. a real bank OTP warning) must NOT be flagged as a scam.
// Lesson learned in PesanAman: without this, legit warnings score HIGH.
export const WARNING_PHRASES = [
  "waspada",
  "hati-hati",
  "jangan pernah",
  "jangan klik",
  "penipuan",
  "awas",
  "jangan berikan",
  "jangan bagikan",
];

export const URL_SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.ly",
  "cutt.ly",
  "s.id",
  "shorturl.at",
  "is.gd",
  "rebrand.ly",
  "goo.gl",
];

export const SUSPICIOUS_TLDS = [".xyz", ".top", ".click", ".shop", ".online", ".buzz", ".fun", ".icu", ".site"];

const KEYWORD_WEIGHT = 0.18;
const MAX_KEYWORD_HITS = 4;
const WARNING_WEIGHT = 0.25;
const MAX_WARNINGS = 3;

export function extractUrls(text) {
  const matches = text.match(/https?:\/\/[^\s)]+|www\.[^\s)]+|[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s)]*)?/gi);
  return matches ? [...new Set(matches.map((u) => u.toLowerCase()))] : [];
}

export function checkUrl(url) {
  const flags = [];
  const lower = url.toLowerCase();
  if (URL_SHORTENERS.some((s) => lower.includes(s))) flags.push("shortener");
  if (lower.includes(".apk")) flags.push("apk-file");
  if (SUSPICIOUS_TLDS.some((t) => lower.includes(t))) flags.push("suspicious-tld");
  if (/https?:\/\/\d+\.\d+\.\d+\.\d+/.test(lower)) flags.push("ip-literal");
  if (lower.includes("xn--")) flags.push("punycode");
  return flags;
}

const URL_FLAG_WEIGHTS = {
  shortener: 0.25,
  "apk-file": 0.3,
  "suspicious-tld": 0.15,
  "ip-literal": 0.25,
  punycode: 0.3,
};

/**
 * Score a pasted message / link. Returns:
 * { score 0..1, level: 'LOW'|'MEDIUM'|'HIGH', category, hits, urlFlags, warningHits }
 */
export function scoreMessage(rawText) {
  const text = (rawText || "").toLowerCase();
  const hits = [];
  const categoryScores = {};

  for (const [key, cat] of Object.entries(CATEGORIES)) {
    let count = 0;
    for (const kw of cat.keywords) {
      if (text.includes(kw)) {
        hits.push({ category: key, keyword: kw });
        count += 1;
      }
    }
    categoryScores[key] = count;
  }

  let bestCategory = null;
  let bestCount = 0;
  for (const [key, count] of Object.entries(categoryScores)) {
    if (count > bestCount) {
      bestCount = count;
      bestCategory = key;
    }
  }

  const keywordScore = Math.min(hits.length, MAX_KEYWORD_HITS) * KEYWORD_WEIGHT;

  const urls = extractUrls(rawText || "");
  const urlFlags = [];
  for (const url of urls) {
    for (const flag of checkUrl(url)) {
      if (!urlFlags.includes(flag)) urlFlags.push(flag);
    }
  }
  const urlScore = urlFlags.reduce((sum, f) => sum + (URL_FLAG_WEIGHTS[f] || 0), 0);

  const warningHits = WARNING_PHRASES.filter((p) => text.includes(p));
  const warningScore = Math.min(warningHits.length, MAX_WARNINGS) * WARNING_WEIGHT;

  let score = keywordScore + urlScore - warningScore;
  score = Math.max(0, Math.min(1, score));

  const level = score >= 0.65 ? "HIGH" : score >= 0.35 ? "MEDIUM" : "LOW";

  return {
    score: Math.round(score * 1000) / 1000,
    level,
    category: bestCount > 0 ? bestCategory : null,
    categoryLabel: bestCategory ? CATEGORIES[bestCategory].label : null,
    hits,
    urlFlags,
    warningHits,
  };
}
