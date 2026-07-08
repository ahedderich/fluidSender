FROM oven/bun:latest
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

EXPOSE 3001
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3001

CMD ["bun", "run", "dev"]
