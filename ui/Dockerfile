FROM oven/bun:latest
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

EXPOSE 3000
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000

CMD ["bun", "run", "dev"]
