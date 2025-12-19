# Test task: Bitrix24 export 10,000 companies (Node.js + Express + Vue)

This project exports up to 10,000 companies from Bitrix24 CRM using an incoming webhook (REST API).
Results are displayed in the browser (Vue) and can be saved as `companies.json`.

## Requirements
- Node.js 18+

## Configuration
Create a `.env` file in the project root (do not commit it):

B24_BASE_URL="https://<your-domain>.bitrix24.ru/rest/<user_id>/<secret>/"

## Install
npm install

## Run
npm start

Open:
http://localhost:3000

## Output
- Browser UI: shows export status and preview
- File: `companies.json` (after export)