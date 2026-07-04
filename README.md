# GuanDan

Local GuanDan table prototype built with Vite, React, TypeScript, and a Fastify API.

## Requirements

- Node.js
- npm

## Install

```powershell
npm install
```

## Start

On Windows, double-click:

```text
start-guandan.cmd
```

Or run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-guandan.ps1
```

The app opens at:

```text
http://127.0.0.1:5173/
```

The local API runs at:

```text
http://127.0.0.1:5174/
```

During development the frontend uses Vite's `/api` proxy, so browser requests stay same-origin on port `5173`.

## Development

Run the API and frontend in separate terminals:

```powershell
npm run api
```

```powershell
npm run dev
```

## Checks

```powershell
npm test
npm run build
```
