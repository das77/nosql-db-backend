FROM node:24-slim

WORKDIR /app

# package files first so the dependency layer caches across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY openapi.yaml ./

# The node images ship a non-root `node` user; use it rather than running as root.
USER node

EXPOSE 3000

CMD ["npm", "start"]
