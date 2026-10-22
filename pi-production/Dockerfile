FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PI_PROJECTS_DIR=/data/projects PORT=8080
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
