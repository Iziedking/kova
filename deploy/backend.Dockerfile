# Node 24 is the current supported runtime for the FLOAT VM service.
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild esbuild

COPY tsconfig.json next-env.d.ts ./
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
ENV FLOAT_BACKEND_HOST=0.0.0.0
ENV FLOAT_BACKEND_PORT=8787

USER node
EXPOSE 8787

CMD ["npm", "run", "backend:start"]
