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

## LAN testing on Windows

Run the API and frontend in separate PowerShell windows:

```powershell
npm run api
```

```powershell
npm run dev
```

Find this computer's Wi-Fi IPv4 address:

```powershell
ipconfig
```

From a phone or computer connected to the same Wi-Fi, open:

```text
http://<computer-LAN-IP>:5173/
```

For example, if `ipconfig` shows `192.168.1.20`, use `http://192.168.1.20:5173/`.

If Windows shows a firewall prompt, allow Node.js on **Private networks**. If no prompt appears and the other device cannot connect, add inbound TCP firewall rules for ports `5173` and `5174` on private networks. Do not expose these development servers to public networks.

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
