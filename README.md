# AI Ticket Manager

Multi-agent orchestration system for automating Freshdesk ticket analysis via Discord.

## Architecture

```
Discord Bot  →  Backend Orchestrator  →  Specialist Agents
   │                    │                      │
   │                    ├─ Freshdesk API       ├─ KB Agent (existing)
   │                    ├─ Claude (classify)   ├─ Price Agent (Phase 2)
   │                    └─ Synthesize          └─ Artwork Agent (Phase 2)
```

## Quick Start

### 1. Install Dependencies

```bash
# Backend
cd backend && npm install

# Discord Bot
cd discord-bot && npm install
```

### 2. Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials

# Discord Bot
cp discord-bot/.env.example discord-bot/.env
# Edit discord-bot/.env with your credentials
```

### 3. Run Locally

```bash
# Terminal 1: Start backend
cd backend && npm run dev

# Terminal 2: Start Discord bot
cd discord-bot && npm run dev
```

## Usage

In Discord, type:
```
!ticket 24343
```

The bot will:
1. Fetch the ticket from Freshdesk
2. Summarize the conversation thread
3. Classify customer intent (KNOWLEDGE, PRICE, ARTWORK)
4. Query the KB Agent for relevant information
5. Return a formatted embed with all details

## Project Structure

```
ai-ticket-manager/
├── discord-bot/          # Discord bot service
│   └── src/
│       ├── commands/     # Command handlers
│       ├── handlers/     # Message routing
│       ├── services/     # Backend API client
│       └── utils/        # Embed builder, logger
│
├── backend/              # Orchestrator backend
│   └── src/
│       ├── routes/       # API endpoints
│       ├── services/     # Freshdesk, classifier, orchestrator
│       ├── agents/       # KB Agent connector
│       └── middleware/   # Auth, error handling
│
└── docs/                 # PRD and documentation
```

## Environment Variables

### Backend

| Variable | Description |
|----------|-------------|
| `FRESHDESK_DOMAIN` | Your Freshdesk domain (e.g., company.freshdesk.com) |
| `FRESHDESK_API_KEY` | Freshdesk API key |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `KB_AGENT_URL` | URL of existing KB Agent backend |
| `KB_AGENT_API_KEY` | API key for KB Agent |
| `API_KEY` | Internal API key for Discord bot |

### Discord Bot

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Discord bot token |
| `BACKEND_URL` | URL of backend service |
| `BACKEND_API_KEY` | Must match backend's API_KEY |

## Deployment (Railway)

Each service has a `Dockerfile` for containerized deployment. Deploy as separate services on Railway.

## Phase Roadmap

- **Phase 1 (MVP)**: ✅ Ticket fetch + summarization + KB agent
- **Phase 2**: Price Agent + Artwork Agent
- **Phase 3**: Auto-reply with human approval
