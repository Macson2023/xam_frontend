FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=
ARG VITE_WS_URL=
ARG VITE_CALLS_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_CALLS_URL=$VITE_CALLS_URL

RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

ENV BACKEND_ORIGIN=http://backend:8000
ENV CALLS_ORIGIN=http://host.docker.internal:8081
ENV TLS_CERT_DIR=/etc/nginx/certs

COPY docker/10-self-signed-cert.sh /docker-entrypoint.d/10-self-signed-cert.sh
RUN chmod +x /docker-entrypoint.d/10-self-signed-cert.sh

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
