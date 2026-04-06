# 🎯 Getting Started with Trivia Mesh

Complete setup guide for running your first trivia game!

## 📋 Prerequisites Checklist

- [x] Node.js 18+ installed
- [x] npm 9+ installed
- [x] Solace PubSub+ broker access
- [ ] (Optional) OpenAI or Anthropic API key

## 🏃 5-Minute Quickstart

### 1. Clone & Install

```bash
git clone https://github.com/himoacs/trivia-millionaire.git
cd trivia-millionaire
npm install
```

### 2. Configure Solace

**If you have Solace Cloud:**
```bash
cp .env.example .env
# Edit .env with your Solace Cloud credentials
```

**If using local Docker:**
```bash
# Start Solace
docker run -d -p 8008:8008 -p 8080:8080 \
  --shm-size=2g \
  --env username_admin_globalaccesslevel=admin \
  --env username_admin_password=admin \
  --name=solace \
  solace/solace-pubsub-standard

# Use default .env settings (already configured for localhost)
cp .env.example .env
```

### 3. Start Development

```bash
npm run dev
```

This starts:
- **Backend**: http://localhost:3001
- **Admin UI**: http://localhost:5174
- **Player UI**: http://localhost:5173

### 4. Test the Game

1. **Admin Setup**:
   - Go to http://localhost:5174
   - Login with password `admin123`
   - Click "Create Session"
   - Note the 6-digit code

2. **Join as Player**:
   - On your phone, go to http://localhost:5173
   - Enter the 6-digit code
   - Choose nickname and avatar

3. **Play**:
   - Admin: Add questions (manual or AI)
   - Admin: Click "Release Next Question"
   - Player: Answer on phone
   - Repeat!
   - Admin: Close session to show leaderboard

## 🎓 Demo Mode (For Presentations)

### Setup for Live Demo

1. **Connect to projector** - Admin UI on big screen
2. **Enable Solace Viewer** - Click "Show Solace Messages"
3. **Subscribe to topics** - Use preset or custom patterns

### Recommended Demo Flow

```
1. Show QR code, explain join process
   ↓
2. Players join from phones
   Subscribe to: trivia/session/{sessionId}/players
   ↓
3. Release first question
   Subscribe to: trivia/session/{sessionId}/question
   ↓
4. Players answer
   Subscribe to: trivia/session/*/player/*/answer
   ↓
5. Show scores updating
   Subscribe to: trivia/session/{sessionId}/player/*/score
   ↓
6. Close session
   Subscribe to: trivia/session/{sessionId}/leaderboard
```

### Explaining Topics

Point out the topic structure in messages:

```javascript
// Single-level wildcard (*)
"trivia/session/*/question"
// Matches: trivia/session/ABC123/question
//          trivia/session/XYZ789/question

// Multi-level wildcard (>)
"trivia/session/ABC123/>"
// Matches: trivia/session/ABC123/question
//          trivia/session/ABC123/players
//          trivia/session/ABC123/player/p1/answer
//          trivia/session/ABC123/player/p1/score
```

## 🤖 AI Question Generation

### OpenAI Setup

```bash
# Get API key from platform.openai.com
export OPENAI_API_KEY=sk-...
```

In `.env`:
```env
OPENAI_API_KEY=sk-...
LITELLM_MODEL=gpt-3.5-turbo
# or gpt-4
```

### Anthropic Setup

```bash
# Get API key from console.anthropic.com
export ANTHROPIC_API_KEY=sk-ant-...
```

In `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...
LITELLM_MODEL=claude-3-sonnet-20240229
# or claude-3-opus-20240229
```

### Generate Questions

In Admin UI:
1. Click "Generate with AI"
2. Choose category (optional)
3. Choose difficulty (optional)
4. Questions appear in queue

## 📱 Mobile Setup

### Local Network Access

To allow phones on same WiFi to connect:

1. **Find your IP** (Mac/Linux):
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
# Example: 192.168.1.100
```

2. **Update CORS** in `.env`:
```env
CORS_ORIGIN=http://192.168.1.100:5173,http://192.168.1.100:5174
```

3. **Restart server**:
```bash
npm run dev:server
```

4. **Players visit**:
```
http://192.168.1.100:5173
```

### ngrok (For Remote Players)

```bash
# Install ngrok
brew install ngrok

# Tunnel client
ngrok http 5173

# Use ngrok URL in QR code
```

## 🐛 Troubleshooting

### Solace Connection Failed

**Error**: `Failed to connect to Solace broker`

**Solutions**:
- Check broker is running: `docker ps` (if local)
- Verify credentials in `.env`
- Check firewall allows port 8008
- Try `ws://` vs `wss://` for SSL

### Port Already in Use

**Error**: `EADDRINUSE: address already in use`

**Solutions**:
```bash
# Kill process on port
lsof -ti:3001 | xargs kill -9  # Server
lsof -ti:5173 | xargs kill -9  # Client
lsof -ti:5174 | xargs kill -9  # Admin
```

### Build Errors

**Error**: TypeScript compilation errors

**Solutions**:
```bash
# Clean install
npm run clean
npm install

# Build shared package first
cd packages/shared
npm run build
```

### AI Generation Not Working

**Error**: `No AI provider configured`

**Solutions**:
- Check API key in `.env`
- Verify key is valid
- Check rate limits on AI provider
- Try different model

## 🎨 Customization

### Change Colors

Edit `packages/shared/src/constants.ts`:

```typescript
export const COLORS = {
  primary: '#YOUR_COLOR',
  // ...
}
```

### Change Admin Password

In `.env`:
```env
ADMIN_PASSWORD=your_secure_password
```

### Modify Scoring Algorithm

Edit `packages/shared/src/utils.ts`:

```typescript
export function calculateScore(
  correct: boolean,
  basePoints: number,
  timeTaken: number,
  timeLimit: number,
  bonusMultiplier: number = 0.5
): number {
  // Your custom logic
}
```

## 📊 Production Deployment

### Environment Variables

Required for production:
```env
NODE_ENV=production
SOLACE_BROKER_URL=wss://your-broker.cloud
SOLACE_VPN_NAME=your-vpn
SOLACE_USERNAME=prod-user
SOLACE_PASSWORD=secure-password
ADMIN_PASSWORD=strong-admin-password
CORS_ORIGIN=https://yourdomain.com
```

### Build & Deploy

```bash
# Build all packages
npm run build

# Start server
cd packages/server
npm start
```

### Static Hosting (Admin & Client)

```bash
# Build frontends
npm run build:admin
npm run build:client

# Upload to hosting:
# packages/admin/dist -> admin.yourdomain.com
# packages/client/dist -> play.yourdomain.com
```

Recommended hosts:
- Vercel
- Netlify
- Cloudflare Pages
- AWS S3 + CloudFront

## 🆘 Getting Help

1. **Check README.md** - Main documentation
2. **Search Issues** - [GitHub Issues](https://github.com/himoacs/trivia-millionaire/issues)
3. **Solace Community** - [community.solace.com](https://community.solace.com)
4. **Create Issue** - Describe problem with logs

---

**Ready to play? Go to http://localhost:5174 🚀**
