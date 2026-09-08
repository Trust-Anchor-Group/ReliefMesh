# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY web ./web
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS node-runtime

FROM mcr.microsoft.com/dotnet/runtime:8.0-bookworm-slim
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
RUN groupadd --gid 10001 reliefmesh && useradd --uid 10001 --gid reliefmesh --create-home reliefmesh \
    && mkdir -p /app /var/lib/reliefmesh /var/lib/neuro-a /var/lib/neuro-b /opt/neuroali \
    && chown -R reliefmesh:reliefmesh /app /var/lib/reliefmesh /var/lib/neuro-a /var/lib/neuro-b /opt/neuroali
WORKDIR /app
COPY --from=build --chown=reliefmesh:reliefmesh /app/package.json ./
COPY --from=build --chown=reliefmesh:reliefmesh /app/node_modules ./node_modules
COPY --from=build --chown=reliefmesh:reliefmesh /app/dist ./dist
COPY --from=build --chown=reliefmesh:reliefmesh /app/web-dist ./web-dist

ENV RELIEFMESH_HOST=0.0.0.0 \
    RELIEFMESH_PORT=4317 \
    RELIEFMESH_RUNTIME_DIR=/var/lib/reliefmesh \
    PUBLIC_SANDBOX=1 \
    NEUROALI_DLL=/opt/neuroali/NeuroAli.dll \
    NEUROALI_DATA_A=/var/lib/neuro-a \
    NEUROALI_DATA_B=/var/lib/neuro-b
EXPOSE 4317
USER reliefmesh
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node","-e","fetch('http://127.0.0.1:4317/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node","dist/server.js"]