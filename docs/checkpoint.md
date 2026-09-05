# Current live checkpoint

Actor B completed credential onboarding, identity creation, profile photo attachment and ReadyForApproval through Neuro-Ali MCP. Each mutation has a durable dispatch guard. The user reported manual Lab approval. Subsequent MCP resources/list described the same saved LegalId as an Approved Digital Identity, and GetBalance returned Success=true. These are own-identity readiness signals, not cross-party petition verification.

Both actors still return 63 tools. Build and seven local checks pass.

Messaging implementation uses the real SendChatMessage/GetMessage schemas and mid: message resources. The two-way test sends one unique request and one reply, validates peer address plus exact payload, preserves unrelated messages, and journals sends before dispatch. It has NOT been run: the two bare XMPP participant addresses are needed. Enter them in /setup or supply addresses only in chat. Credentials are never requested in chat.

Next: configure the two distinct existing bare JIDs, POST the local /api/test/two-way endpoint once, inspect its actual proof status, then continue UI/agent implementation only after messaging succeeds. No credentials, identity or photo step should be repeated.

The backend remains running on localhost:4317. Future code reloads can use the guarded /api/runtime/close endpoint while idle, then npm start. This gracefully closes both SDK transports and reuses their existing data directories on restart.

No petition, signature, or AI claim is proven yet. The project is not complete.
