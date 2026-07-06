#!/bin/sh
# Write nginx's DNS resolver from the container's /etc/resolv.conf, so the /jf
# proxy (which uses a variable proxy_pass for lazy resolution) can resolve
# JELLYFIN_SERVER at request time. Runs before nginx starts (docker-entrypoint.d).
set -e
ns=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf 2>/dev/null || true)
[ -n "$ns" ] || ns=127.0.0.11   # Docker's embedded DNS (user-defined networks)
printf 'resolver %s ipv6=off valid=30s;\n' "$ns" > /etc/nginx/conf.d/resolver.conf
