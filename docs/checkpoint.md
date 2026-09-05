# Live checkpoint — 2026-09-05

BUILD=PASS
ACTOR_A_MCP=PASS
ACTOR_A_TOOLS=63
ACTOR_B_MCP=PASS
ACTOR_B_TOOLS=63
REQUIRED_TOOLS=PASS

Neuro-Ali remains clean on ali/stdio-interoperability. ReliefMesh started Actor A and B using distinct data directories and ports 52482 / 52483.

Actor B onboarding call has NOT started: automatic approval review rejected browser invocation despite explicit instructions in the user attachment. Setup is running at http://localhost:4317/setup. Next action is the volunteer connection button (GetIdentityApplicationProperties with empty arguments).

Do not call ApplyForNewPersonalIdentity until credentials work. Call it exactly once, persist a one-shot intent journal before dispatch, and retain returned LegalId before further onboarding. That continuation is not implemented yet.

Actual tool inputs from tools/list:
- GetIdentityApplicationProperties: {}
- ApplyForNewPersonalIdentity: {}
- AddPhotoAttachmentElicitation: LegalId required; PhotoType enum default ProfilePhoto.
- ReadyForApproval: LegalId required.
- SendChatMessage: To (bare JID, 3–256 chars), Message (1–10000 chars) required; IsMarkdown defaults false; Language optional, max 10.
- GetMessage: MessageId required; Remove defaults false.
- PopMessage: {} (consumes next message; avoid unrelated messages).
- PetitionLegalIdentity: LegalId and Purpose required.

Implementation follow-ups: unwrap structuredContent.result when interpreting application Success; add full typed form enumeration/default handling; persist identity creation guard before enabling identity creation. Neither message nor identity creation endpoint is currently exposed. Do not claim project completion.

