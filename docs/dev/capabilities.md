# Live capability discovery

Both actors returned 66 tools after the upstream package update. Runtime schemas are stored alongside this report, without actor credentials or identity resources.

- PetitionLegalIdentity: PRESENT
- PetitionSignature: PRESENT
- PetitionSmartContract: PRESENT
- SendChatMessage: PRESENT
- GetMessage: PRESENT
- PopMessage: PRESENT
- CreateOpenContract: PRESENT
- ProposeContract: PRESENT
- SignContract: PRESENT
- GetBalance: PRESENT
- GetPendingPayments: PRESENT
- CreatePaymentToBareJidUri: PRESENT
- CreatePaymentToLegalIdUri: PRESENT
- ProcessPaymentUri: PRESENT
- LogInformational: PRESENT
- Search: PRESENT

Resources: joined list and JSON-negotiated identity reads passed. Actor A has two approved identities; Actor B has one approved identity. No identities were created. Default TOON output remains available to other clients. Resource subscription methods are implemented in ReliefMesh but have not yet been live-certified.

Template discovery: both complete resource listings returned zero iotsc resources. resources/templates/list returns JSON-RPC method-not-found. Installed Identity 1.0.2 GetResources enumerates owned identities and petition-cache objects, not a global contract-template registry. No deployed template is known. A real template must be made accessible; local example XML is not evidence of deployment.

Both read-only wallet checks returned Amount=0, Reserved=0, Currency=TST. The minimum payment schema amount is 0.01. No payment URI or transaction was created.

Conditional URI schema contains ConditionalContractId. Installed ProcessPaymentUri calls SendEDalerUriAsync. This is source/schema evidence only; server enforcement still requires live certification.
