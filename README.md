# ReliefMesh

A real AI crisis-coordination reference application for FIRSTBLOCK-ATHON, inspired by the Swedish Red Cross secure volunteer coordination / trusted messaging case.

Human intent → AI agent → official MCP TypeScript client → Neuro-Ali STDIO → Neuro → human volunteer → real reply.

**Why MCP?** If application code controls Neuro, use Agent API. If your AI agent itself needs to operate Neuro, MCP is the natural interface.

## Run

Requires Node 22+, .NET 8 and the existing Neuro-Ali Release DLL at `C:\Users\alile\NeuroAli\bin\Release\net8.0\NeuroAli.dll`.

```powershell
npm ci
npm run build
npm start
```

Open [Coordinator](http://localhost:4317/), [Volunteer](http://localhost:4317/volunteer), or [Setup](http://localhost:4317/setup).

For AI, copy `.env.example` to local `.env`, set `AI_PROVIDER`, `AI_MODEL`, and `OPENAI_API_KEY` (or `AI_API_KEY`). Use a model your standalone API account can access. `openai` uses Responses; `openai-compatible` uses Chat Completions and also requires `AI_BASE_URL`. The SDK does not automatically retry requests. Keys stay on the backend and are never accepted by the UI.

The backend owns two independent Neuro-Ali children: A uses `.neuroali-data` / 52482; B uses `.neuroali-data-b` / 52483, both under `C:\Users\alile\NeuroAli`. Never copy their databases or run conflicting owners. The official MCP client uses default legacy initialization and advertises form and URL elicitation.

## Real evidence

Both actors returned 63 tools. Actor B completed credential onboarding, identity creation, profile photo and ReadyForApproval through this custom MCP client. After manual Lab approval, MCP reported its identity as approved and GetBalance succeeded.

The single correlated messaging test passed A → B → A using SendChatMessage and GetMessage. `GetMessage(Remove=false)` preserves unrelated messages. The actual proof appears in the technical drawer; the test cannot be automatically repeated.

The AI sees only the real SendChatMessage and GetMessage schemas. The dispatcher limits it to the configured volunteer and known incoming messages; it exposes no payments or identity mutations. The volunteer replies as a human. Incoming messages and conversation text stay in memory and disappear on backend restart; the durable test proof remains. No simulated Neuro results, Agent API calls, or encryption claims.

## Demo status

The live AI-driven browser exchange passed on 2026-09-06: the model selected SendChatMessage, Actor B displayed the real request, the volunteer UI sent a demo reply, and Actor A received it before the AI summarized the actual 19:00 delivery confirmation. Identity petition is **not available in the current demo**: a live attempt exposed missing recipient callback registration in Neuro-Ali. The unproven action is omitted; see docs/petition-investigation.md. Signatures are not implemented. Never interpret identity readiness as cross-party verification.

## Lifecycle and privacy

Open exact elicitation URLs through Setup. Credentials, personal identity data and photos go directly to Neuro-hosted forms. Do not restart while an interaction is pending. Identity creation, photo submission, approval submission and the one-off petition have durable dispatch guards. An uncertain result requires inspection, never an automatic retry.

Use `.runtime` only for local ignored state: safe operation guards, participant addresses, safe identity IDs and proof. No raw tool results, passwords, photos or PII are logged by ReliefMesh. Neuro-Ali owns its separate runtime logging. Do not commit either runtime. This is a loopback-only reference app, not a deployed multi-user service.

To reload while idle, POST `/api/runtime/close` with header `X-ReliefMesh: 1`, then run `npm start`. It refuses active tool calls, elicitation or AI work.

## Checks

`npm run build` type-checks backend and React and builds production assets. `npm test` checks real captured catalogs, live status, request-origin protection, result decoding and distinct JID validation. Tests do not simulate Neuro operation results. See `docs/checkpoint.md` for verified demo evidence and the runbook.

