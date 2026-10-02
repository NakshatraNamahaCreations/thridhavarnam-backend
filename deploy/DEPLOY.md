# Deploying the high-traffic setup (Hostinger VPS, Ubuntu)

This brings the API from "fails at 1,000 shoppers" to handling 5,000+.
Server: 4 vCPU, 16 GB RAM, nginx 1.24 in front of Node on port 5000.

Run everything below on the VPS over SSH, from the backend folder
(called `~/thridhavarnam-backend` here; use your real path).

## 1. Install Redis (shared cache)

```bash
sudo apt update && sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping            # -> PONG
```

Ubuntu's Redis listens on 127.0.0.1 only. Keep it that way.

## 2. Update the code and .env

```bash
cd ~/thridhavarnam-backend
git pull                   # or upload the changed files
npm ci --omit=dev          # installs the new ioredis dependency
```

Add to `.env`:

```
REDIS_URL=redis://127.0.0.1:6379
NODE_ENV=production
```

`WEB_CONCURRENCY` is optional. By default the API starts one worker per CPU core (4).

## 3. Raise kernel limits

```bash
sudo cp deploy/99-thridhavarnam-sysctl.conf /etc/sysctl.d/
sudo sysctl --system
```

## 4. Restart the API with one PM2 process

The API now forks its own workers, so PM2 must run it once, in fork mode.

```bash
pm2 delete all             # or just the old API entry: pm2 delete <name>
ulimit -n 65535            # more open sockets for the Node workers
pm2 start deploy/ecosystem.config.js
pm2 save
```

If PM2 runs as a systemd service (`pm2 startup`), also add `LimitNOFILE=65535`
under `[Service]` in `/etc/systemd/system/pm2-<user>.service`, then run
`sudo systemctl daemon-reload`.

Check that it worked:

```bash
curl -s http://127.0.0.1:5000/api/health
# {"ok":true,"service":"vastra-crm-api","redis":"up"}
pm2 logs thridhavarnam-api --lines 20   # 4 "API ... running" lines, 4 "Redis connected"
```

## 5. nginx

Back up the current config first:

```bash
sudo cp -r /etc/nginx /etc/nginx.bak-$(date +%F)
```

1. Edit `/etc/nginx/nginx.conf` and apply the values in `deploy/nginx-main-tuning.conf`.
   Replace the existing `worker_connections` line and add `worker_rlimit_nofile` and `multi_accept`.
2. Replace the API site with `deploy/nginx-api.thridhavarnam.com.conf`:
   ```bash
   sudo mkdir -p /var/cache/nginx/thv
   sudo cp deploy/nginx-api.thridhavarnam.com.conf /etc/nginx/sites-available/api.thridhavarnam.com
   sudo ln -sf /etc/nginx/sites-available/api.thridhavarnam.com /etc/nginx/sites-enabled/
   ```
   Remove any other enabled file that also has `server_name api.thridhavarnam.com`.
   If another site on this server also listens on 443, `backlog=` may appear on only
   one `listen 443` line in total. Keep it in this file and remove it from the others.
3. Test and reload:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

To roll back nginx, restore `/etc/nginx.bak-<date>` and reload.

## 6. Verify

```bash
curl -sI https://api.thridhavarnam.com/api/products | grep -i "x-cache\|x-nginx-cache"
```

The first request shows `X-Cache: MISS`. Repeats show `X-Nginx-Cache: HIT` or `X-Cache: HIT`.

## How the caching behaves

- Public GETs (products, categories, banners, storefront/init, ...) are cached in
  each worker, in Redis (shared), and by nginx for 5 seconds.
- Any successful admin edit or storefront order clears the API caches on every worker at once.
  The storefront shows the change within about 5 seconds, which is the nginx cache window.
- The admin panel always gets current data, because requests carrying a login token skip
  nginx's cache and never get a stale API copy.
- If Redis stops, the API keeps working on its in-process cache, and `/api/health` reports `"redis":"down"`.
