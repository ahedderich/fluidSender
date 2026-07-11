FROM oven/bun:latest
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

EXPOSE 3001
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3001

# oven/bun:latest isn't guaranteed to ship a premade non-root user across
# versions, so create one explicitly rather than assume. node_modules/.nuxt
# are separate named volumes (see docker-compose.yaml) so Docker seeds them
# from this ownership on first run; ./fluid-sim/sim-ui itself is bind-mounted
# from the host and only needs to be readable, not writable, by the dev server.
RUN (getent group 1000 >/dev/null || groupadd --gid 1000 simui) \
    && (getent passwd 1000 >/dev/null || useradd --uid 1000 --gid 1000 --no-create-home simui) \
    && chown -R 1000:1000 /app
USER 1000:1000

CMD ["bun", "run", "dev"]
