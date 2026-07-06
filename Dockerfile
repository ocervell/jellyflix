# ---- Build the static SPA -------------------------------------------------
# Plain FROM so this builds with either the classic builder (`docker build .`)
# or buildx. Under a buildx multi-arch build the JS is rebuilt per target arch
# (it's arch-independent output, so that's just wasted CPU, not a correctness
# issue); the tiny nginx runtime layer below is what actually differs per arch.
FROM node:22-alpine AS builder
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
# Sets nginx's DNS resolver (from the container's resolv.conf) before startup,
# so the /jf proxy can resolve JELLYFIN_SERVER lazily / per-request.
COPY docker/10-resolver.sh /docker-entrypoint.d/10-resolver.sh
RUN chmod +x /docker-entrypoint.d/10-resolver.sh

# The Jellyfin server the app's /jf proxy targets. Override at runtime:
#   docker run -e JELLYFIN_SERVER=https://your-jellyfin.example.com ...
ENV JELLYFIN_SERVER=http://jellyfin:8096
# Only substitute JELLYFIN_SERVER via the official nginx envsubst step, so
# nginx's own $variables in the template are left untouched.
ENV NGINX_ENVSUBST_FILTER=JELLYFIN_SERVER

EXPOSE 80
