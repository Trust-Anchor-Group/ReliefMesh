# Live checkpoint

REAL_TWO_WAY_MCP_MESSAGING=PASS
A_TO_B_MESSAGE=PASS
B_RECEIVED=PASS
B_TO_A_REPLY=PASS
A_RECEIVED_REPLY=PASS
ACTOR_A_TOOLS=63
ACTOR_B_TOOLS=63

The unique request and reply both correlated on exact body and expected bare JID. Do not rerun the test or remove its dispatch guard.

Actor B's existing identity lifecycle is complete through Lab approval. MCP resources/list described the saved identity as approved, and GetBalance returned Success=true. The data directories and saved LegalId remain unchanged.

Coordinator, Volunteer and Setup routes are implemented and build/type-check. UI send/reply and AI-driven end-to-end evidence still need a real model and human exchange. No key/model is configured at this checkpoint. Provider adapters support OpenAI Responses and compatible Chat Completions; keys are environment-only. Message polling is non-consuming, and the model only receives SendChatMessage and GetMessage.

Petition investigation found the full generic path in installed Waher.Mcp.Identity 1.0.1: PetitionLegalIdentity sends via PetitionIdentityAsync and returns PetitionId; incoming PetitionForIdentityReceived elicits hosted consent; recipient consent sends PetitionIdentityResponseAsync; requester PetitionedIdentityResponseReceived elicits hosted acknowledgement and caches the identity after acknowledgement. No Neuro-Ali modification was needed. Live end-to-end petition evidence is still pending. Do not label it PASS based only on successful petition submission.

All sensitive tool results are parsed in memory and excluded from activity logs. Do not print pending petition message contents: these can include identity PII. Read only actor, mode, safe IDs and flags for diagnostics.

Next: one real petition → human B consent → human A acknowledgement → confirm returned resource/correlation. Also obtain a valid AI provider/model/key via the local environment and run a single judged coordinator → volunteer → human reply exchange. The project is not finished.
