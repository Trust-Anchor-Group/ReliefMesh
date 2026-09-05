# Optional petition investigation

IDENTITY_PETITION_E2E=NOT_AVAILABLE_WITH_CURRENT_MCP

One PetitionLegalIdentity call returned Success=true and a PetitionId. Actor B did not receive elicitation. At the matching time its existing Neuro-Ali event log recorded IOException: “Session no longer active.” The stack runs from JsonRpcClientRequest.SendRequest through HttpMcpServerResource.ElicitUserInput to IdentityMcpServer.ContractsClient_PetitionForIdentityReceived.

Installed library inspection confirms the recipient consent handler exists. JsonRpcClientRequest.SendRequest throws this exception when the owning web service has no matching registered notification callback. Neuro-Ali's current main loop registers the STDIO session on only the current request target. A joined resources/list can initialize B's identity client without registering a callback on the identity service. That leaves out-of-call consent unable to reach the MCP client.

A proposed generic fix is to register the current live STDIO callback on all joined service owners after initialization/each routed request, instead of only the last target. This fix has NOT been applied, built, or validated. Automatic approval review rejected creating/applying the separate-branch change because it did not accept the attached authorization exception. The known-good Neuro-Ali branch is unchanged.

Per the fallback scope, the petition action is removed from the judged UI. No second petition was sent. No consent or cross-party verification is claimed. A future implementation must use the authorized separate branch, build Release, smoke-check all 63 tools, and validate actual recipient consent and correlated requester return before re-enabling it. Do not remove dispatch guards to silently retry.
