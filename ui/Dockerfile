# Dev image.
#
# IMPORTANT: Nitro/crossws WebSocket upgrades DO NOT work when `nuxt dev` runs
# under Bun's runtime — Bun's node:http upgrade handling is broken in dev, so the
# client handshake never completes (https://github.com/nitrojs/nitro/issues/2721).
# We therefore DEVELOP on Node and keep Bun only as the package manager. Production
# (Dockerfile.prd) still runs on Bun, where WebSockets work after `nuxt build`.
FROM node:22-slim
WORKDIR /app

# Bun as the package manager (respects bun.lock); Node is the runtime.
RUN npm install -g bun@1.3.14

COPY package.json bun.lock* ./
RUN bun install

EXPOSE 3000
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000

# node:22-slim ships a non-root "node" user (uid/gid 1000) for exactly this
# purpose. node_modules/.nuxt are separate named volumes (see docker-compose.yaml)
# so Docker seeds them from this ownership on first run; ./ui itself is bind-mounted
# from the host and only needs to be readable, not writable, by the dev server.
RUN chown -R node:node /app
USER node

# Run the dev server under Node (NOT `bun run dev`, which would use Bun's runtime).
CMD ["npm", "run", "dev"]
