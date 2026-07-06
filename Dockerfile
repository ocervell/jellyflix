# syntax=docker/dockerfile:1

# ---- Build the static SPA -------------------------------------------------
# The build output is pure static JS/CSS/HTML (arch-independent), so always run
# it on the native builder arch (--platform=$BUILDPLATFORM). This keeps
# multi-arch images cheap: only the tiny nginx runtime layer below varies.
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Serve with nginx + reverse-proxy /jf -> the Jellyfin server ----------
FROM nginx:1.27-alpine

# Built SPA
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config template; ${JELLYFIN_SERVER} is substituted at container start
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template

# The Jellyfin server the app's /jf proxy targets. Override at runtime:
#   docker run -e JELLYFIN_SERVER=https://your-jellyfin.example.com ...
ENV JELLYFIN_SERVER=http://jellyfin:8096
# Only substitute JELLYFIN_SERVER via the official nginx envsubst step, so
# nginx's own $variables in the template are left untouched.
ENV NGINX_ENVSUBST_FILTER=JELLYFIN_SERVER

EXPOSE 80
