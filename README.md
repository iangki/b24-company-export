# Test task: Bitrix24 export 10,000 companies (Node.js + Express + Vue)

This project exports up to 10,000 companies from Bitrix24 CRM using an incoming webhook (REST API).  
Results are displayed in the browser (Vue) and are saved as `companies.json`.

## Requirements
- Node.js 18+

## Configuration (webhook)

Bitrix24 REST API access in this project is done via an **incoming webhook**.  
The incoming webhook URL format is `https://<portal>/rest/<user_id>/<secret>/`.
The webhook secret key should be treated like a password and kept private.

1) Create a `.env` file in the project root (do not commit it).
You can copy the template:

```bash
cp .env.example .env
```

2) Put your Bitrix24 incoming webhook base URL into `.env`:

```env
B24_BASE_URL="https://<portal>.bitrix24.ru/rest/<user_id>/<secret>/"
```

Important:
- `B24_BASE_URL` must end with `/`.
- Do not append method names like `batch.json` / `crm.company.list.json` — the server will append `${method}.json` automatically.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Open: [http://localhost:3000](http://localhost:3000)

## How to check (review steps)

1) Replace `B24_BASE_URL` in `.env` with your own webhook URL.
2) Start the app and open `http://localhost:3000`.  
3) Click **Export 10,000 companies**.  
4) The UI will show the count + preview and provide a link to download `companies.json`.

## Output
- Browser UI: shows export status and preview (first 20 items).
- File: `companies.json` (created after export).
- Download URL: `/companies.json`.

## Troubleshooting
- `Bitrix24 HTTP 403` usually means invalid webhook credentials or missing permissions for the requested method.