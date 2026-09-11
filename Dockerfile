FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG APP_URL=http://localhost:3000
RUN pnpm build
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
RUN chown -R node:node /app
USER node
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
