# Verified demo � 2026-09-06

```ini
BUILD=PASS
ACTOR_A_MCP=PASS
ACTOR_B_MCP=PASS
REAL_TWO_WAY_MCP_MESSAGING=PASS
AI_AGENT_REAL_MCP_CALL=PASS
VOLUNTEER_UI_REAL_MESSAGE=PASS
VOLUNTEER_UI_REAL_REPLY=PASS
COORDINATOR_RECEIVES_REAL_REPLY=PASS
NO_MOCKED_NEURO_RESULTS=PASS
SECRETS_CHECK=PASS
DEMO_READY=PASS
```

The live browser flow passed twice, including once after the final connection-handling fix. Both actors expose 63 tools through the official MCP client and independent STDIO processes. The AI selected SendChatMessage using the real catalog. Actor B displayed the request, and its volunteer composer sent the real reply. Actor A received that reply before the model summarized it. Browser consoles reported no errors. Build and all nine tests passed. Tracked files and production assets passed the secrets check. Neuro-Ali source was not changed.

Final received request ID: `mid:bzyRm3Is0P2nOwo8OcerLw`. Final received reply ID: `mid:KQBepLRyJ0KJ_Pes3Ga1TA`. The demo reply was: �FIRSTBLOCK demo: Yes, I can deliver 30 blankets tonight at 19:00.� The AI reported: �The Solna volunteer confirmed that she can deliver 30 blankets tonight at 19:00.�

## Run the judged flow

1. Keep the backend running at http://localhost:4317/. Open /volunteer in a second window.
2. Wait until both actors are connected (63 tools each).
3. Ask: �Ask the Solna volunteer whether she can deliver 30 blankets tonight�.
4. Observe the actual request in the volunteer inbox, then enter a harmless demo reply.
5. Return to the coordinator: the actual reply appears alongside its AI summary after polling.

The demo is ready with the existing local provider configuration. Keys remain in ignored .env; never paste them into chat. Conversation is held in memory and clears on restart. The original historical two-way proof is preserved separately; do not rerun its one-shot endpoint. Regular A/B demo messages are authorized.

If an overnight MCP session fails, the app marks it disconnected and blocks coordination. When idle, POST /api/runtime/close with X-ReliefMesh: 1, then run npm start. Never automatically retry an ambiguous send. Do not restart during identity interactions.

Optional identity petitions and signatures are omitted. No cross-party identity verification is claimed. This is a local reference demo, not a production service.
