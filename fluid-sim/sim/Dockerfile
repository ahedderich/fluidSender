FROM rust:latest
WORKDIR /app

# Pre-fetch dependencies for layer caching
COPY Cargo.toml Cargo.lock* ./
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs \
    && cargo build \
    && rm -rf src

EXPOSE 8765

CMD ["cargo", "run"]
