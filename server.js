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

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.json({ ok: true }));

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

async function b24Post(method, body) {
  const url = `${B24_BASE_URL}${method}.json`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

  if (!r.ok) {
    throw new Error(`Bitrix24 HTTP ${r.status}: ${JSON.stringify(data)}`);
  }
  if (data.error) {
    throw new Error(`Bitrix24 error: ${data.error} ${data.error_description || ""}`);
  }

  return data;
}

async function exportCompanies(max = 10000) {
  const pageSize = 50;
  const pages = Math.ceil(max / pageSize);
  const batches = Math.ceil(pages / 50);

  const all = [];

  for (let b = 0; b < batches; b++) {
    const cmd = {};
    const fromPage = b * 50;
    const toPage = Math.min(fromPage + 50, pages);

    for (let p = fromPage; p < toPage; p++) {
      const start = p * pageSize;

      const query = buildQuery({
        start,
        order: { ID: "ASC" },
        select: ["ID", "TITLE", "COMPANY_TYPE", "INDUSTRY"],
      });

      cmd[`p${p}`] = `crm.company.list?${query}`;
    }

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
  }

  return all.slice(0, max);
}

app.post("/api/export", async (req, res) => {
  try {
    const limit = Number(req.body?.limit || 10000);

    const companies = await exportCompanies(limit);
    const outPath = path.join(__dirname, "companies.json");
    await fs.writeFile(outPath, JSON.stringify(companies, null, 2), "utf-8");

    res.json({
      ok: true,
      count: companies.length,
      preview: companies.slice(0, 20),
      downloadUrl: "/companies.json",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/companies.json", (req, res) => {
  res.sendFile(path.join(__dirname, "companies.json"));
});

app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));