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

# rust:latest has no premade non-root user; guard against a base-image update
# ever adding uid/gid 1000 out from under us.
RUN (getent group 1000 >/dev/null || groupadd --gid 1000 sim) \
    && (getent passwd 1000 >/dev/null || useradd --uid 1000 --gid 1000 --no-create-home sim) \
    && chown -R 1000:1000 /app
USER 1000:1000

CMD ["./target/release/fluidsim"]
