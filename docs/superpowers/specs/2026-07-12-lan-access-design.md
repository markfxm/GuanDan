# LAN Access Design

## Goal

Allow the development frontend and API to be reached by devices on the same local network, without changing game or room behavior and without relaxing production CORS.

## Design

The Vite development server will bind to `0.0.0.0` through the existing `dev` script. The Fastify development entrypoint will bind to `process.env.HOST ?? "0.0.0.0"` while retaining port `5174` by default.

The API will keep its explicit localhost origins. In non-production environments it will also allow HTTP origins on port `5173` whose host is an IPv4 private-network address (`10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`). Production will retain the existing explicit origin allow-list.

## Testing

Server tests will prove a private LAN origin receives the CORS response during development and is not allowed in production. Existing unit tests and the TypeScript/Vite build will be run after the change.

## Windows LAN Test Flow

Run the API and frontend in separate PowerShell windows. Find the computer IPv4 address with `ipconfig`; visit `http://<IPv4>:5173` from a device on the same Wi-Fi. If Windows prompts for network access, permit private-network access; otherwise add inbound TCP rules for ports 5173 and 5174.
