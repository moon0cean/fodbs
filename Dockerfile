FROM node:22-bookworm-slim

WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx playwright install --with-deps chromium \
  && npm run build \
  && npm prune --omit=dev \
  && useradd --create-home --uid 10001 fodbs \
  && chown -R fodbs:fodbs /app /ms-playwright

USER fodbs
ENV NODE_ENV=production
EXPOSE 8088
CMD ["node", "dist/server.js"]
