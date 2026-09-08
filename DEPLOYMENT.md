# ReliefMesh Live Sandbox Deployment

ReliefMesh runs as one persistent application instance. It owns two long-lived Neuro-Ali STDIO children and grants one browser an exclusive 30-minute lease over that Actor A/B pair. Do not scale this container above one replica and do not run another process against either Neuro-Ali data directory.

Hosted OAuth is the preferred future architecture, but it is blocked until the operator provisions an OAuth client. This package deliberately uses the already proven local Node + Neuro-Ali architecture. It does not add signup or retry OAuth registration.

## Host requirements

- A persistent Linux VM or container host with Docker.
- Node.js 22 (provided by the image) and the .NET 8 runtime (provided by the image).
- A DNS name and HTTPS reverse proxy.
- The published Neuro-Ali .NET 8 output, including `NeuroAli.dll` and its adjacent runtime files.
- The existing Actor A and Actor B Neuro-Ali data directories, copied while every process using them is stopped.
- A server-side AI provider key and tool-capable model.
- Four host directories that are never placed in the repository or public web root.

Example host layout:

```text
/srv/reliefmesh/neuroali/       # Neuro-Ali published application
/srv/reliefmesh/actor-a/        # Actor A encrypted state
/srv/reliefmesh/actor-b/        # Actor B encrypted state
/srv/reliefmesh/runtime/        # ReliefMesh lease and mission state
```

The image runs as UID/GID `10001`. Give that identity read access to `neuroali/` and read/write access to the three state directories. Back up all state directories before migration. Never copy a live Neuro-Ali database.

## Build and configure

The production application build is `npm ci && npm run build`; its production entry point is `npm start` (`node dist/server.js`). The container build performs both dependency installation and `npm run build`, then starts the same compiled entry point directly.

```bash
docker build -t reliefmesh:live .
cp .env.example /srv/reliefmesh/reliefmesh.env
```

Edit the server-side environment file. At minimum, set:

```dotenv
RELIEFMESH_HOST=0.0.0.0
RELIEFMESH_PORT=4317
RELIEFMESH_PUBLIC_ORIGIN=https://sandbox.example.org
RELIEFMESH_RUNTIME_DIR=/var/lib/reliefmesh
SANDBOX_COOKIE_SECURE=1
RELIEFMESH_TRUST_PROXY=1
PUBLIC_SANDBOX=1
NEUROALI_DLL=/opt/neuroali/NeuroAli.dll
NEUROALI_DATA_A=/var/lib/neuro-a
NEUROALI_DATA_B=/var/lib/neuro-b
NEUROALI_PORT_A=52482
NEUROALI_PORT_B=52483
DEMO_PAYMENT_AMOUNT=0.01
AI_PROVIDER=openai
AI_MODEL=your-tool-capable-model
OPENAI_API_KEY=replace-on-host
```

For an OpenAI-compatible provider, set `AI_PROVIDER=openai-compatible`, `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` instead. `RELIEFMESH_PORT` is the private application port; keep it bound to loopback at the host boundary. `NEUROALI_DLL` must point to the mounted published Neuro-Ali DLL. The A and B data paths are the persistent Coordinator and Volunteer stores respectively, and `RELIEFMESH_RUNTIME_DIR` must be writable and persistent.

Keep the environment file readable only by the deployment account. Do not put API keys, Neuro credentials, eDaler URIs, identity data, or browser lease cookies in source control, image layers, proxy logs, or monitoring labels.

## Automatic start on a VM

The checked-in [systemd unit](deploy/reliefmesh.service) is the production process manager. ReliefMesh starts both Neuro-Ali actors as child processes through STDIO, so they do not need separate services. The service waits for networking and Docker, recreates the single container from persistent mounts, restarts it after failures, and gives graceful shutdown up to 110 seconds so the Node process can close both actors.

Install and enable it after building the image and creating the environment file and host directories:

```bash
sudo install -m 0644 deploy/reliefmesh.service /etc/systemd/system/reliefmesh.service
sudo systemctl daemon-reload
sudo systemctl enable --now docker.service reliefmesh.service
sudo systemctl status reliefmesh.service
```

The expected reboot sequence is:

```text
network and Docker ready
→ systemd starts the ReliefMesh container
→ ReliefMesh launches Actor A and Actor B from their persistent data paths
→ both MCP connections initialize
→ GET /health reports ready: true
```

Do not combine the systemd unit with Docker's own `--restart` policy; systemd is the sole process manager in this configuration. For a manual non-systemd smoke run, use:

```bash
docker run -d \
  --name reliefmesh \
  --restart unless-stopped \
  --env-file /srv/reliefmesh/reliefmesh.env \
  -p 127.0.0.1:4317:4317 \
  -v /srv/reliefmesh/neuroali:/opt/neuroali:ro \
  -v /srv/reliefmesh/actor-a:/var/lib/neuro-a \
  -v /srv/reliefmesh/actor-b:/var/lib/neuro-b \
  -v /srv/reliefmesh/runtime:/var/lib/reliefmesh \
  reliefmesh:live
```

The runtime must stay persistent across restarts because it contains operation guards, mission state, and the hashed active lease. Actor A and Actor B identity and wallet state survive because their data paths are separate persistent host mounts. The raw browser lease token is only stored in its `HttpOnly` cookie.

## Reverse proxy

Terminate TLS at the reverse proxy and forward to `http://127.0.0.1:4317` without rewriting the `Host` header. WebSocket support is not required; `/api/events` uses server-sent events, so disable response buffering for that route. Set a proxy read timeout longer than 30 minutes.

Only expose the HTTPS origin. Port `4317`, Neuro-Ali callback ports `52482` and `52483`, all data directories, and the Neuro-Ali application directory remain private to the host. `RELIEFMESH_PUBLIC_ORIGIN` must exactly match the browser origin or host/origin validation will reject requests.

## Health and operation

```bash
curl --fail http://127.0.0.1:4317/health
```

The endpoint returns only `status`, `service`, and `ready`. HTTP 200 means the Node service is responding; `ready: true` means both Neuro-Ali MCP children are connected. Do not use an automatic restart policy that kills a process during an active mission solely because `ready` is false.

After a reboot or service restart, wait for readiness without mutating the runtime:

```bash
until curl --silent --fail http://127.0.0.1:4317/health | grep -q '"ready":true'; do sleep 5; done
```

This check performs no contract, signature, payment, messaging, identity, or OAuth operation.

Before an upgrade, verify there is no active MCP call, elicitation, signature, or payment operation. Stop the existing container, back up the state directories, then start exactly one replacement. If state is ambiguous, preserve it for operator review rather than deleting it or retrying an operation.

No deployment is performed by this repository change. DNS, host access, TLS, provider credentials, and final Neuro-Ali paths must be supplied by the operator.