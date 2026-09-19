# Node 24 multi-architecture image resolved and compatibility-tested 2026-09-19.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild esbuild

COPY tsconfig.json next-env.d.ts ./
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
ENV KOVA_BACKEND_HOST=0.0.0.0
ENV KOVA_BACKEND_PORT=8787

USER node
EXPOSE 8787

CMD ["npm", "run", "backend:start"]
