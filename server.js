require("dotenv").config();

const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

let B24_BASE_URL = (process.env.B24_BASE_URL || "").trim();
if (!B24_BASE_URL) {
  throw new Error(
    'B24_BASE_URL is required. Create .env (or set env var) with something like:\n' +
      'B24_BASE_URL="https://<portal>.bitrix24.ru/rest/<user_id>/<secret>/"'
  );
}
if (!B24_BASE_URL.endsWith("/")) B24_BASE_URL += "/";

try {
  new URL(B24_BASE_URL);
} catch {
  throw new Error(`B24_BASE_URL is invalid: ${B24_BASE_URL}`);
}

const OUT_FILE = path.join(__dirname, "companies.json");
const OUT_FILE_TMP = path.join(__dirname, "companies.json.tmp");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.json({ ok: true }));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function buildQuery(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(v)}`);
    } else if (value && typeof value === "object") {
      for (const [k2, v2] of Object.entries(value)) {
        parts.push(`${encodeURIComponent(key)}[${encodeURIComponent(k2)}]=${encodeURIComponent(v2)}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join("&");
}

async function b24Post(method, body, opts = {}) {
  const url = `${B24_BASE_URL}${method}.json`;
  const maxRetries = opts.maxRetries ?? 4;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const text = await r.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    const isRetryableHttp = r.status === 429 || (r.status >= 500 && r.status <= 599);
    if (!r.ok) {
      if (isRetryableHttp && attempt < maxRetries) {
        const backoffMs = 500 * Math.pow(2, attempt);
        await sleep(backoffMs);
        continue;
      }
      throw new Error(`Bitrix24 HTTP ${r.status}: ${JSON.stringify(data)}`);
    }

    if (data && data.error) {
      const retryCodes = opts.retryOnB24ErrorCodes || [];
      const shouldRetry = retryCodes.includes(data.error);

      if (shouldRetry && attempt < maxRetries) {
        const backoffMs = 500 * Math.pow(2, attempt);
        await sleep(backoffMs);
        continue;
      }

      throw new Error(`Bitrix24 error: ${data.error} ${data.error_description || ""}`.trim());
    }

    return data;
  }

  throw new Error("Bitrix24 request failed after retries");
}

async function exportCompanies(max = 10000) {
  const PAGE_SIZE = 50;
  const totalPages = Math.ceil(max / PAGE_SIZE);

  const all = [];
  let cmdPerBatch = 50;

  let page = 0;
  while (page < totalPages) {
    const chunkPages = Math.min(cmdPerBatch, totalPages - page);

    const cmd = {};
    for (let i = 0; i < chunkPages; i++) {
      const p = page + i;
      const start = p * PAGE_SIZE;

      const query = buildQuery({
        start,
        order: { ID: "ASC" },
        select: ["ID", "TITLE", "COMPANY_TYPE", "INDUSTRY"]
      });

      cmd[`p${p}`] = `crm.company.list?${query}`;
    }

    try {
      const resp = await b24Post("batch", { halt: 0, cmd });
      const result = resp.result?.result || {};
      const resultError = resp.result?.result_error || null;

      if (resultError && Object.keys(resultError).length) {
        throw new Error(`Bitrix24 batch partial error: ${JSON.stringify(resultError)}`);
      }

      for (const key of Object.keys(result)) {
        all.push(...(result[key] || []));
        if (all.length >= max) return all.slice(0, max);
      }

      page += chunkPages;

      if (page < totalPages) await sleep(700);
    } catch (e) {
      const msg = String(e?.message || e);

      if (msg.includes("ERROR_BATCH_LENGTH_EXCEEDED") && cmdPerBatch > 1) {
        cmdPerBatch = Math.max(1, Math.floor(cmdPerBatch / 2));
        continue;
      }

      throw e;
    }
  }

  return all.slice(0, max);
}

let exportRunning = false;

app.post("/api/export", async (req, res) => {
  if (exportRunning) {
    return res.status(409).json({ ok: false, error: "Export is already running" });
  }

  exportRunning = true;
  try {
    const limit = clampInt(req.body?.limit, 1, 10000, 10000);

    const companies = await exportCompanies(limit);

    await fs.writeFile(OUT_FILE_TMP, JSON.stringify(companies, null, 2), "utf-8");
    await fs.rename(OUT_FILE_TMP, OUT_FILE);

    res.json({
      ok: true,
      count: companies.length,
      preview: companies.slice(0, 20),
      downloadUrl: "/companies.json"
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  } finally {
    exportRunning = false;
  }
});

app.get("/companies.json", async (req, res) => {
  try {
    await fs.access(OUT_FILE);
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(OUT_FILE);
  } catch {
    res.status(404).json({ ok: false, error: "companies.json not found. Run export first." });
  }
});

app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));