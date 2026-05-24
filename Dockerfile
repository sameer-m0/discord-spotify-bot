# --- Stage 1: Build go-librespot ---
FROM golang:1.22-alpine AS go-builder
RUN apk add --no-cache git
WORKDIR /src
RUN git clone https://github.com/devgianlu/go-librespot.git .
RUN go build -o go-librespot ./cmd/go-librespot

# --- Stage 2: Install and compile native Node.js dependencies ---
FROM node:22-bookworm-slim AS node-builder
RUN apt-get update && apt-get install -y python3 make g++ gcc libtool autoconf automake
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# --- Stage 3: Runtime image ---
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy built node_modules
COPY --from=node-builder /app/node_modules ./node_modules

# Copy compiled go-librespot binary
COPY --from=go-builder /src/go-librespot ./go-librespot

# Copy project source files
COPY src ./src
COPY config.yml ./config.yml
COPY package.json ./package.json

# Environment variables configuration defaults
ENV LIBRESPOT_PATH=./go-librespot
ENV LIBRESPOT_CONFIG_DIR=/app/data
ENV LIBRESPOT_API=http://localhost:3678
ENV ALEXA_WEBHOOK_PORT=3679

# Create persistent data directory
RUN mkdir -p /app/data

EXPOSE 3679 3678

CMD ["npm", "start"]
