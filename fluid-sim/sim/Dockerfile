FROM rust:latest
WORKDIR /app

# Pre-fetch dependencies for layer caching
COPY Cargo.toml Cargo.lock* ./
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs \
    && cargo build --release \
    && rm -rf src

COPY . .
RUN cargo build --release

EXPOSE 8765 8766

CMD ["./target/release/fluidsim"]
