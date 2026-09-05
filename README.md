# ReliefMesh

A FIRSTBLOCK-ATHON reference build inspired by the Swedish Red Cross secure volunteer coordination / trusted messaging case.

Intended demonstration: human intent → AI agent → official MCP client → Neuro-Ali STDIO → real Neuro → volunteer → real reply.

“If application code controls Neuro, use Agent API. If your AI agent itself needs to operate Neuro, MCP is the natural interface.”

## Run

Requires Node 22+, .NET 8, and the existing Neuro-Ali Release DLL.

```powershell
npm ci
npm run build
npm start
```

Open http://localhost:4317/setup. The backend owns two independent Neuro-Ali children:
- A: existing .neuroali-data, port 52482.
- B: independent .neuroali-data-b, port 52483.

Both directories live under C:\Users\alile\NeuroAli. Stop conflicting Neuro-Ali runtimes before starting. Never share or copy their databases. Do not start a second ReliefMesh backend while this one is running.

## Current live evidence

- Official @modelcontextprotocol/client 2.0.0, default legacy initialize.
- Actor A and B each returned 63 real MCP tools.
- Both contain SendChatMessage, GetMessage, PopMessage, PetitionLegalIdentity.
- React setup UI receives live status through SSE.
- Client advertises elicitation.form and elicitation.url and handles elicitation/create.
- No Neuro operation uses HTTP APIs directly.

## Checkpoint / remaining work

The application is NOT complete. Actor B credential onboarding is awaiting a human action. No new identity or message has been sent. Two-way messaging, identity petition, AI agent, and the coordination/volunteer messaging UI are not yet implemented or proven. /volunteer currently displays the setup surface.

Use “Connect volunteer to Neuro” to initiate exactly one GetIdentityApplicationProperties call. If prompted, open the exact hosted URL and enter credentials there, never in chat. The original MCP call stays pending in the backend for up to one hour; refreshing the setup page reattaches to its state. Keep the backend running. A backend restart does not preserve in-flight elicitation; runtime credentials themselves belong to Neuro-Ali.

Activity events retain only actor alias, operation, timestamp, and status. Tool contents and server diagnostics are not logged. Status and elicitation data are memory-only; tool catalogs saved under ignored .runtime contain schemas only. Local HTTP endpoints enforce loopback host/origin and a custom mutation header. This is a local reference build, not a deployed multi-user service.

No claim of verified identity, delivery, petition consent, or end-to-end encryption is made.

## Checks

`npm run build` compiles the backend and builds React.
`npm test` checks the real catalogs saved by the live runtimes, and the security boundary on the running local backend. It does not simulate Neuro results.

