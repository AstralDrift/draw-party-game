FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client ./
RUN npm run build

FROM rust:1.82-alpine AS server
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY Cargo.toml ./
COPY server ./server
RUN cargo build --manifest-path server/Cargo.toml --release

FROM alpine:3.20
WORKDIR /app
COPY --from=server /app/server/target/release/draw-party-server /usr/local/bin/draw-party-server
COPY --from=client /app/client/dist ./client/dist
ENV DRAW_PARTY_STATIC_DIR=/app/client/dist
ENV DRAW_PARTY_BIND=0.0.0.0:3000
EXPOSE 3000
CMD ["draw-party-server"]
