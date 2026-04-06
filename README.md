# 🎮 Trivia Mesh

A real-time multiplayer trivia game powered by **Solace PubSub+** messaging. Built to demonstrate event-driven architecture with hierarchical topics and wildcard subscriptions.

![Solace](https://img.shields.io/badge/Powered%20by-Solace-00C895?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMiAyMkgyMkwxMiAyWiIgZmlsbD0iIzAwQzg5NSIvPgo8L3N2Zz4=)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Docker (for Solace broker)

### 1. Start Solace Broker
```bash
docker run -d -p 8008:8008 -p 8080:8080 \
  --shm-size=2g \
  --name=solace solace/solace-pubsub-standard
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start All Services
```bash
npm run dev:fresh
```

This will start:
- **Server** on http://localhost:3001 (Backend + Solace integration)
- **Admin** on http://localhost:5176 (Presenter view)
- **Client** on http://localhost:5173 (Player view)

### 4. Play!
1. Open Admin: http://localhost:5176 (password: `admin123`)
2. Create a session
3. Add questions (manual or AI-generated)
4. Players join at http://localhost:5173 using the session code
5. Start the game and watch real-time Solace messages flow! 📡

**💡 See detailed instructions in [SOLACE_INTEGRATION.md](./SOLACE_INTEGRATION.md)**

---

## ✨ Features

### 🎯 Kahoot-Style Gameplay
- **Real-time multiplayer** - Multiple players compete simultaneously
- **Timed questions** - Configurable countdown timers (10-60 seconds)
- **Score bonuses** - Faster answers earn more points
- **Live leaderboards** - See rankings after the game

### 🎨 Modern UI/UX
- **Mobile-first design** - Optimized for phones and tablets
- **Smooth animations** - Powered by Framer Motion
- **Sound effects** - Audio feedback for engagement
- **Confetti celebrations** - For top performers! 🎉

### 📡 Educational Solace Demo Features
- **Live message viewer** - Watch Solace messages in real-time
- **Topic hierarchy visualization** - See hierarchical topic structure
- **Wildcard subscriptions** - Demonstrate `*` and `>` patterns
- **Preset patterns** - Quick subscribe to common patterns

### 🤖 AI Question Generation
- **Multi-provider support** - OpenAI, Anthropic Claude, or LiteLLM
- **Customizable difficulty** - Easy, Medium, Hard
- **Category selection** - General, Science, History, etc.
- **Bulk generation** - Generate multiple questions at once

### 📱 Social Sharing
- **LinkedIn integration** - Share scores on LinkedIn
- **Scorecard generation** - Beautiful PNG scorecards
- **Download & share** - Save and post results

## 🏗️ Architecture

```
trivia-millionaire/
├── packages/
│   ├── shared/          # Shared TypeScript types & utilities
│   ├── server/          # Node.js backend + Solace integration
│   ├── admin/           # React admin UI (presenter view)
│   └── client/          # React player UI (mobile-optimized)
```

### Topic Hierarchy

```
trivia/
└── session/
    └── {sessionId}/
        ├── control                    # Admin commands
        ├── question                   # Question broadcasts
        ├── players                    # Player join/leave events
        ├── leaderboard               # Final results
        └── player/
            └── {playerId}/
                ├── answer            # Answer submissions
                └── score             # Score updates
```

### Wildcard Examples

- `trivia/session/*/question` - All question broadcasts
- `trivia/session/ABC123/>` - All messages for session ABC123
- `trivia/session/*/player/*/answer` - All answer submissions

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm 9+
- **Solace PubSub+ Broker** - See setup options below
- **AI API Key** (optional) - For question generation

### Solace Setup Options

#### Option 1: Solace Cloud (Recommended for Demo)
1. Sign up at [solace.com/cloud](https://solace.com/cloud)
2. Create a free messaging service
3. Note your connection details

#### Option 2: Local Docker
```bash
docker run -d -p 8008:8008 -p 8080:8080 -p 1883:1883 -p 8000:8000 -p 5672:5672 -p 9000:9000 -p 2222:2222 --shm-size=2g --env username_admin_globalaccesslevel=admin --env username_admin_password=admin --name=solace solace/solace-pubsub-standard
```

Access at: `ws://localhost:8008`

### Installation

```bash
# Clone repository
git clone https://github.com/himoacs/trivia-millionaire.git
cd trivia-millionaire

# Install dependencies
npm install

# Copy environment example
cp .env.example .env

# Edit .env with your Solace credentials
nano .env
```

### Configuration

Edit `.env`:

```env
# Solace PubSub+ Broker
SOLACE_BROKER_URL=ws://localhost:8008
SOLACE_VPN_NAME=default
SOLACE_USERNAME=default
SOLACE_PASSWORD=default

# Server
PORT=3001
ADMIN_PASSWORD=admin123

# AI Services (optional)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
LITELLM_MODEL=gpt-3.5-turbo

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

### Run Development Servers

```bash
# Run all services (server + admin + client)
npm run dev

# Or run individually
npm run dev:server   # Backend on :3001
npm run dev:admin    # Admin UI on :5174
npm run dev:client   # Player UI on :5173
```

## 📖 Usage Guide

### For Admins (Presenters)

1. **Login** at `http://localhost:5174`
   - Use password from `.env` file

2. **Create Session**
   - Enter a session name
   - QR code and join code will be generated

3. **Add Questions**
   - **Manual**: Click "Add Manual" and enter question details
   - **AI Generated**: Choose category/difficulty and generate

4. **Live Demo Mode** 🔴
   - Click "Show Solace Messages" button
   - Subscribe to topics using presets or custom patterns
   - Watch real-time message flow during the game
   - Explain hierarchical topics and wildcards to audience

5. **Start Game**
   - Wait for players to join
   - Click "Release Next Question" to begin
   - Monitor answers in real-time

6. **Close Session**
   - After all questions, click "Close Session"
   - Leaderboard is broadcast to all players

### For Players

1. **Join Game**
   - Scan QR code OR visit `http://localhost:5173`
   - Enter 6-character game code

2. **Choose Profile**
   - Pick a nickname
   - Select an avatar

3. **Play**
   - Answer questions as fast as possible
   - See your score update live
   - Faster = more points!

4. **View Results**
   - See your final rank
   - Download scorecard
   - Share on LinkedIn

## 🎨 Design System

### Colors (Solace Brand)

```css
--solace-green: #00C895
--solace-navy: #1A3A52
--answer-red: #E21B3C
--answer-blue: #1368CE
--answer-yellow: #D89E00
--answer-green: #26890C
```

### Animations

- **Framer Motion** - Page transitions, question reveals
- **Tailwind CSS** - Hover effects, button presses
- **Canvas Confetti** - Victory celebrations
- **Custom keyframes** - Shake, pop, float effects

### Sound Effects

Built-in Web Audio API tones for:
- Player join
- Question start
- Timer tick
- Correct answer ✓
- Wrong answer ✗
- Leaderboard reveal

## 🔧 Development

### Build for Production

```bash
# Build all packages
npm run build

# Build individually
npm run build:server
npm run build:admin
npm run build:client
```

### Type Checking

```bash
# Check all packages
npm run typecheck
```

### Project Structure

```
packages/
├── shared/
│   └── src/
│       ├── types.ts         # TypeScript interfaces
│       ├── utils.ts         # Helper functions
│       └── constants.ts     # Colors, sounds, etc.
│
├── server/
│   └── src/
│       ├── index.ts         # Express server
│       └── services/
│           ├── solace.ts    # Solace integration
│           ├── session.ts   # Session management
│           └── ai.ts        # AI question generation
│
├── admin/
│   └── src/
│       ├── pages/           # Login, Dashboard, SessionView
│       └── components/
│           └── SolaceDebugPanel.tsx  # Message viewer
│
└── client/
    └── src/
        ├── pages/           # Home, Join, Game, Results
        └── utils/
            └── sound.ts     # Sound manager
```

## 🎓 Educational Use Cases

### Teaching Event-Driven Architecture

1. **Show topic hierarchy** - Demonstrate organized message structure
2. **Wildcard subscriptions** - Explain `*` vs `>` patterns
3. **Pub/Sub model** - Show decoupled communication
4. **Real-time messaging** - Low latency event distribution
5. **Scalability** - Add players without backend changes

### Demo Flow

1. Open admin UI on projector
2. Show Solace Message Viewer panel
3. Subscribe to `trivia/session/*/question` (wildcard)
4. Players join from phones
5. Show join events: `trivia/session/{id}/players`
6. Release question
7. Show answer flood: `trivia/session/{id}/player/*/answer`
8. Show score updates: `trivia/session/{id}/player/*/score`
9. Close session and show leaderboard

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 🙏 Acknowledgments

- **Solace** - For the amazing PubSub+ platform
- **Kahoot** - Inspiration for gameplay mechanics
- **React** - UI framework
- **Framer Motion** - Animation library
- **LiteLLM** - AI model abstraction

## 🐛 Known Issues & Roadmap

### Known Issues
- Solace connection may need retry logic on disconnect
- ScoreCard scaling on some mobile devices

### Roadmap
- [ ] Question editor UI
- [ ] Session history/replay
- [ ] Team mode
- [ ] Custom avatars
- [ ] Voice announcements
- [ ] More AI providers
- [ ] Kubernetes deployment guide
- [ ] Progressive Web App (PWA)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/himoacs/trivia-millionaire/issues)
- **Solace Community**: [community.solace.com](https://community.solace.com)
- **Documentation**: [docs.solace.com](https://docs.solace.com)

---

**Built with ❤️ using Solace PubSub+**
