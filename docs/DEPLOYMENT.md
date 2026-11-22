# Deployment

The whole app (MongoDB, the local LLM, the AI service, the API and the frontend) runs from one Docker Compose file. The same setup works on a laptop and on a cloud VM.

```
browser ──► frontend (nginx :80) ──/api, /uploads──► backend (Express :5000) ──► ai-service (FastAPI :8000) ──► ollama (:11434)
                    │                                       │
                    └── React build (static files)          └──► mongo (:27017)
```

Only the frontend container is published. nginx serves the React build and forwards `/api` and `/uploads` to the backend, so the browser talks to a single address. MongoDB, the AI service and Ollama are never exposed.

## 1. Run it locally

**Needs:** Docker Desktop and about 8 GB of free disk (the images plus about 1.6 GB of models).

```bash
cp .env.example .env          # then set JWT_SECRET to a long random string
docker compose up -d --build  # first run downloads the Ollama models (a few minutes)
docker compose ps             # all services "running"; ollama-pull exits with code 0
```

Open http://localhost:8080.

Create the first admin:
```bash
docker compose exec backend node scripts/create-admin.js you@example.com
```
The script asks for a password. If the email already has an account, it promotes that account to Admin and leaves its password as it is.

## 2. Deploy to a cloud VM

### 2.1 Pick a VM

The local LLM needs memory, so free "web app" tiers such as Render or Vercel can't run it. Use a VM with at least **4 GB RAM** (8 GB is more comfortable) and **30 GB disk**, running Ubuntu 22.04 or 24.04.

| Option | Cost | Notes |
|---|---|---|
| Azure for Students | $100 credit, no card | **Recommended.** A `B2ms` (8 GB, about $60/month) or `B2s` (4 GB, about $30/month). Stop the VM when not in use to save credit. |
| Oracle Cloud "Always Free" Ampere A1 | Free (card needed to sign up) | Capped at 2 ARM cores / 12 GB RAM since mid-2026, and A1 capacity is often unavailable ("out of host capacity"). All images used here have ARM64 builds. See the firewall note in step 2.2. |
| AWS / GCP credits | Credits | `t3.large` / `e2-standard-2` or bigger. |

In the provider's network settings, open inbound ports **22** (SSH), **80** and **443**.

### 2.2 Install Docker on the VM

```bash
ssh ubuntu@<VM_IP>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && exit     # log out and back in so the group applies
```

**Oracle Cloud only:** Ubuntu images there also block ports in iptables.
```bash
sudo iptables -I INPUT 6 -p tcp -m state --state NEW --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp -m state --state NEW --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 2.3 Get the code and configure it

```bash
git clone https://github.com/aboro-code/thumbnail-optimizer.git
cd thumbnail-optimizer
cp .env.example .env
nano .env
```

Set these values in `.env`:
- `JWT_SECRET`: generate one with `openssl rand -hex 32`.
- `DOMAIN`: for HTTPS. If you don't have a domain, use `<VM_IP with dots replaced by dashes>.sslip.io`, e.g. `140-238-1-2.sslip.io`. sslip.io resolves that name to your IP, so Let's Encrypt can issue a real certificate for it.
- `GOOGLE_CLIENT_ID`: optional, see 2.5.

### 2.4 Start it

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
docker compose logs -f ollama-pull        # wait for the two "success" lines, then Ctrl+C
docker compose exec backend node scripts/create-admin.js you@example.com
```

Open `https://<DOMAIN>`. Caddy gets the certificate automatically on the first request, which can take a few seconds.

**HTTP only (quick test, no domain):** run `APP_PORT=80 docker compose up -d --build` and open `http://<VM_IP>`. Email sign-in works; Google sign-in needs HTTPS.

### 2.5 Google sign-in (optional)

In Google Cloud Console → Credentials → your OAuth client:
1. Add `https://<DOMAIN>` to **Authorized JavaScript origins**.
2. Put the client id in `.env` as `GOOGLE_CLIENT_ID`.
3. Rebuild the frontend so the id is baked into the bundle: `docker compose ... up -d --build frontend`.

## 3. Operating it

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f backend` (or `ai-service`, `ollama`, `frontend`) |
| Update to the latest code | `git pull && docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build` |
| Back up the database | `docker compose exec mongo mongodump --archive > backup-$(date +%F).archive` |
| Restore | `docker compose exec -T mongo mongorestore --archive < backup.archive` |
| Mongo shell | `docker compose exec mongo mongosh thumbnail_optimizer` |
| Switch scoring strategy | Set `SCORING_STRATEGY=trained` in `.env`, then `docker compose up -d ai-service` |
| Stop (keeps data) | `docker compose down` |
| Wipe everything | `docker compose down -v` (deletes the database, uploads and models) |

Data lives in named volumes:
- `mongo_data`: the database;
- `uploads`: thumbnail images;
- `ollama_data`: the models;
- `caddy_data`: the certificates.

## 4. Configuration reference (`.env`)

| Variable | Default | Used by |
|---|---|---|
| `JWT_SECRET` | none (required) | backend: signs login tokens |
| `JWT_EXPIRES_IN` | `60m` | backend |
| `GOOGLE_CLIENT_ID` | empty (Google button hidden) | backend + frontend build |
| `SCORING_STRATEGY` | `heuristic` | ai-service (`heuristic` or `trained`) |
| `OLLAMA_MODEL` / `OLLAMA_EMBED_MODEL` | `llama3.2:1b` / `nomic-embed-text` | ai-service, ollama-pull |
| `APP_PORT` | `8080` | host port for the app (HTTP mode) |
| `DOMAIN` | none | Caddy (HTTPS mode only) |

## 5. Troubleshooting

- **Explanations are template sentences** ("This score reflects: …"): Ollama isn't ready or a model is missing. Check **Admin → Model**, or run `docker compose logs ollama-pull`.
- **The first scoring request is slow (about 30 s):** the LLM loads into memory on first use. Later calls take about 3 s per image on CPU.
- **502 from `/api`:** the backend is still starting or crashed. Check `docker compose logs backend`.
- **Upload fails with 413:** nginx allows 60 MB per request (`frontend/nginx.conf`); each image is capped at 10 MB by the API.
- **Out of memory on a 4 GB VM:** add swap: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`.
