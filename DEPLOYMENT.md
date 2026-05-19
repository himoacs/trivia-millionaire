# 🚀 Trivia Millionaire - Deployment Guide

Deploy the Trivia Millionaire app to a remote Linux server using Docker.

## Prerequisites

On your **Linux server**, install:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Logout and login again for group changes to take effect
```

## Quick Deploy (5 minutes)

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/trivia-millionaire.git
cd trivia-millionaire
```

### 2. Configure Environment

```bash
# Copy the example production env file
cp .env.production.example .env.production

# Edit with your values
nano .env.production
```

**Required settings to change:**

```bash
# Your server's public IP or domain
HOST=your-server-ip-or-domain.com

# Solace Cloud credentials (get from Solace Cloud console)
SOLACE_BROKER_URL=wss://your-broker.messaging.solace.cloud:443
SOLACE_VPN_NAME=your-vpn
SOLACE_USERNAME=your-username
SOLACE_PASSWORD=your-password

# Secure admin password (CHANGE THIS!)
ADMIN_PASSWORD=your-secure-password
```

### 3. Build and Start

```bash
# Load environment variables and start
export $(grep -v '^#' .env.production | xargs)
docker compose up -d --build
```

### 4. Verify Deployment

```bash
# Check containers are running
docker compose ps

# Check logs
docker compose logs -f
```

### 5. Access the App

| Service | URL |
|---------|-----|
| **Admin UI** | `http://YOUR_SERVER:4848` |
| **Player UI** | `http://YOUR_SERVER:4849` |
| **API** | `http://YOUR_SERVER:4847` |

---

## Detailed Configuration

### Using a Domain Name with HTTPS

For production with a domain and SSL, use a reverse proxy like Caddy:

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Create `/etc/caddy/Caddyfile`:

```
trivia.yourdomain.com {
    handle /api/* {
        reverse_proxy localhost:4847
    }
    handle {
        reverse_proxy localhost:4849
    }
}

admin.trivia.yourdomain.com {
    reverse_proxy localhost:4848
}
```

Then update your `.env.production`:

```bash
HOST=trivia.yourdomain.com
VITE_API_URL=https://trivia.yourdomain.com/api
VITE_CLIENT_URL=https://trivia.yourdomain.com
VITE_ADMIN_URL=https://admin.trivia.yourdomain.com
CORS_ORIGIN=https://trivia.yourdomain.com,https://admin.trivia.yourdomain.com

# Use WSS for secure WebSocket
SOLACE_BROKER_URL=wss://your-broker.messaging.solace.cloud:443
VITE_SOLACE_BROKER_URL=wss://your-broker.messaging.solace.cloud:443
```

Restart:

```bash
sudo systemctl restart caddy
docker compose down
docker compose up -d --build
```

---

## Firewall Configuration

Open required ports:

```bash
# UFW (Ubuntu)
sudo ufw allow 4847/tcp  # API
sudo ufw allow 4848/tcp  # Admin UI
sudo ufw allow 4849/tcp  # Client UI
sudo ufw allow 80/tcp    # HTTP (for Caddy)
sudo ufw allow 443/tcp   # HTTPS (for Caddy)
sudo ufw enable
```

---

## Management Commands

```bash
# View logs
docker compose logs -f

# Restart services
docker compose restart

# Stop services
docker compose down

# Rebuild after code changes
docker compose up -d --build

# View running containers
docker compose ps

# Access server container shell
docker compose exec server sh

# Backup database
docker compose exec server cat /app/packages/server/data/trivia.db > backup.db
```

---

## Troubleshooting

### Containers not starting

```bash
# Check logs for errors
docker compose logs server
docker compose logs nginx

# Verify environment variables
docker compose config
```

### Can't connect to Solace

1. Verify Solace credentials in `.env.production`
2. Ensure using `wss://` (not `ws://`) for cloud brokers
3. Check firewall allows outbound WebSocket connections

### CORS errors in browser

1. Verify `CORS_ORIGIN` includes all frontend URLs
2. Ensure URLs match exactly (http vs https, with/without port)

### Database persistence

Data is stored in a Docker volume `trivia-data`. To backup:

```bash
docker run --rm -v trivia-millionaire_trivia-data:/data -v $(pwd):/backup alpine tar czf /backup/trivia-backup.tar.gz /data
```

To restore:

```bash
docker run --rm -v trivia-millionaire_trivia-data:/data -v $(pwd):/backup alpine tar xzf /backup/trivia-backup.tar.gz -C /
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Linux Server                          │
│  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │   Nginx (4848)  │  │      Server (4847)          │   │
│  │   - Admin UI    │  │  - Express API              │   │
│  │   - Client UI   │  │  - Solace Publisher         │   │
│  │     (4849)      │  │  - SQLite Database          │   │
│  └────────┬────────┘  └──────────────┬──────────────┘   │
│           │                          │                   │
│           └──────────┬───────────────┘                   │
│                      │                                   │
└──────────────────────┼───────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Solace Cloud   │
              │  PubSub+ Broker │
              └─────────────────┘
```

---

## Getting Solace Cloud Credentials

1. Go to [Solace Cloud](https://console.solace.cloud/)
2. Create a free account
3. Create a new service (free tier available)
4. Go to **Connect** → **Solace Web Messaging**
5. Copy:
   - **Secured Web Messaging Host** → `SOLACE_BROKER_URL`
   - **Message VPN** → `SOLACE_VPN_NAME`
   - **Username** → `SOLACE_USERNAME`
   - **Password** → `SOLACE_PASSWORD`

---

## Need Help?

- Check container logs: `docker compose logs -f`
- Verify Solace connection in Admin UI (debug panel)
- Open an issue on GitHub
