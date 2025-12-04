# Product Requirements Document: AI Ticket Manager

## Multi-Agent Customer Support System

**Version:** 1.0  
**Date:** December 2024  
**Author:** EasyPrint Team  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Objectives](#3-goals--objectives)
4. [System Architecture](#4-system-architecture)
5. [Components](#5-components)
6. [User Stories](#6-user-stories)
7. [Technical Specifications](#7-technical-specifications)
8. [API Specifications](#8-api-specifications)
9. [Data Models](#9-data-models)
10. [Implementation Phases](#10-implementation-phases)
11. [Environment Configuration](#11-environment-configuration)
12. [Success Metrics](#12-success-metrics)
13. [Dependencies](#13-dependencies)

---

## 1. Executive Summary

The AI Ticket Manager is a multi-agent orchestration system that automates customer support ticket processing. It lives in a Discord channel and allows support staff to analyze Freshdesk tickets by typing a simple command. The system intelligently classifies customer inquiries and delegates to specialist agents (Knowledge Base, Pricing, Artwork) to generate comprehensive responses.

### Key Features

- Fetch and analyze Freshdesk tickets via Discord command
- Summarize multi-email conversation threads
- Classify customer intent (Knowledge, Price, Artwork, or Mixed)
- Delegate to specialist agents for domain-specific answers
- Combine agent responses into unified output
- (Future) Auto-reply to Freshdesk with human approval

---

## 2. Problem Statement

### Current Pain Points

1. **Manual Ticket Analysis**: Support staff must manually read through email threads to understand customer requests
2. **Context Switching**: Staff switch between Freshdesk, knowledge base, pricelist spreadsheets, and design team communication
3. **Inconsistent Responses**: Different staff may provide varying quality responses
4. **Slow Response Time**: Complex queries requiring multiple information sources take longer to resolve

### Solution

A multi-agent AI system that:
- Automatically fetches and summarizes ticket conversations
- Intelligently routes queries to appropriate specialist agents
- Combines multiple information sources into cohesive responses
- Provides this functionality within the team's existing Discord workflow

---

## 3. Goals & Objectives

### Primary Goals

| Goal | Success Criteria |
|------|------------------|
| Reduce ticket analysis time | < 30 seconds from command to full analysis |
| Improve response accuracy | Relevant KB articles cited in 90%+ of knowledge queries |
| Streamline workflow | Single Discord command replaces 3-4 tool switches |

### Phase Goals

| Phase | Objective |
|-------|-----------|
| MVP (Phase 1) | Ticket fetch + summarization + KB agent integration |
| Phase 2 | Add Price Agent + Artwork Agent |
| Phase 3 | Auto-reply with human-in-the-loop approval |

---

## 4. System Architecture

### High-Level Architecture

```
                           DISCORD SERVER
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
                ▼                                 ▼
    ┌───────────────────────┐        ┌───────────────────────┐
    │  KB Discord Bot       │        │  Ticket Manager Bot   │
    │  (EXISTING)           │        │  (NEW)                │
    │                       │        │                       │
    │  Standalone KB        │        │  • !ticket <id>       │
    │  queries              │        │  • !price <product>   │
    └───────────────────────┘        └───────────┬───────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │  TICKET MANAGER        │
                                    │  BACKEND               │
                                    │  (Orchestrator)        │
                                    └───────────┬────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
                    ▼                           ▼                           ▼
        ┌───────────────────┐      ┌───────────────────┐      ┌───────────────────┐
        │    KB AGENT       │      │   PRICE AGENT     │      │  ARTWORK AGENT    │
        │    (EXISTING)     │      │   (NEW)           │      │  (NEW)            │
        │                   │      │                   │      │                   │
        │ HTTP API call to  │      │ Google Sheets     │      │ Discord notify    │
        │ existing backend  │      │ pricelist lookup  │      │ #artwork-requests │
        └─────────┬─────────┘      └─────────┬─────────┘      └─────────┬─────────┘
                  │                          │                          │
                  ▼                          ▼                          ▼
           Freshdesk KB              Google Sheets              Discord Channel
```

### Agent Communication Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                 ORCHESTRATOR PATTERN                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User Command → Discord Bot                                  │
│  2. Discord Bot → Orchestrator Backend                          │
│  3. Orchestrator:                                               │
│     a) Fetch ticket from Freshdesk                              │
│     b) Classify intent with Claude                              │
│     c) Call relevant agents IN PARALLEL                         │
│     d) Wait for all responses                                   │
│     e) Synthesize final response with Claude                    │
│  4. Orchestrator → Discord Bot                                  │
│  5. Discord Bot → User (formatted embed)                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Components

### 5.1 AI Ticket Manager (NEW - This Project)

The orchestrator system consisting of:

#### Discord Bot Service
- **Purpose**: User interface via Discord commands
- **Technology**: Node.js, discord.js
- **Commands**:
  - `!ticket <id>` - Analyze a Freshdesk ticket
  - `!price <product>` - Direct price lookup (Phase 2)
  - `!help` - Show available commands

#### Backend Service (Orchestrator)
- **Purpose**: Coordinate agents, process tickets
- **Technology**: Node.js, Express.js
- **Responsibilities**:
  - Freshdesk Tickets API integration
  - Intent classification (Claude)
  - Agent coordination
  - Response synthesis

### 5.2 KB Agent (EXISTING)

Your existing Knowledge Base system.

| Component | URL |
|-----------|-----|
| Backend API | `https://backend-production-5f2c.up.railway.app` |
| MCP Server | `https://mcp-server-production-8b5a.up.railway.app` |
| Discord Bot | `https://discord-bot-production-76e9.up.railway.app` |

**Integration Point**: `POST /api/bot/chat`

```javascript
// Request
{
  "message": "What colors are available for leather card holders?",
  "discordUserId": "ticket-manager-orchestrator",
  "discordChannelId": "internal-agent-call",
  "sessionId": "ticket-mgr-12345"
}

// Response
{
  "response": "Leather card holders are available in...",
  "sources": [{ "id": "123", "title": "...", "url": "..." }],
  "searchTerms": "leather card holders colors",
  "articlesFound": 3,
  "timestamp": "2024-12-04T10:00:00Z"
}
```

### 5.3 Price Agent (NEW - Phase 2)

Specialist agent for pricing queries.

- **Purpose**: Look up product pricing from Google Sheets
- **Technology**: Node.js, Express.js, Google Sheets API
- **Features**:
  - Fuzzy product name matching
  - MOQ (Minimum Order Quantity) information
  - Price tier calculations
  - "Not found" → flag for sourcing team

### 5.4 Artwork Agent (NEW - Phase 2)

Specialist agent for artwork/design requests.

- **Purpose**: Handle artwork requirement requests
- **Technology**: Node.js, Express.js, Discord.js
- **Features**:
  - Extract artwork requirements from ticket
  - Post request to #artwork-requests Discord channel
  - Tag design team
  - Track request status

---

## 6. User Stories

### MVP User Stories (Phase 1)

#### US-1: Analyze Ticket
```
AS A support staff member
I WANT TO type "!ticket 24343" in Discord
SO THAT I can quickly understand what the customer is asking about
```

**Acceptance Criteria:**
- [ ] Bot fetches ticket from Freshdesk within 5 seconds
- [ ] If multi-email thread, provides summary of conversation history
- [ ] Extracts and highlights the latest customer message
- [ ] Classifies intent (KNOWLEDGE, PRICE, ARTWORK, MIXED)
- [ ] If KNOWLEDGE intent, automatically queries KB Agent
- [ ] Displays results in formatted Discord embed

#### US-2: View Thread Summary
```
AS A support staff member
I WANT TO see a summary of previous emails in a ticket thread
SO THAT I don't have to read through the entire conversation
```

**Acceptance Criteria:**
- [ ] Summary includes key points from each email
- [ ] Clearly indicates who said what (customer vs agent)
- [ ] Highlights any commitments or promises made
- [ ] Shows number of emails in thread

#### US-3: Get KB Answer for Ticket
```
AS A support staff member
I WANT TO automatically get relevant KB articles when analyzing a ticket
SO THAT I can quickly find information to respond
```

**Acceptance Criteria:**
- [ ] KB Agent is called when intent includes KNOWLEDGE
- [ ] Relevant articles are cited with IDs
- [ ] Answer is contextual to the customer's question
- [ ] Sources/article links are provided

### Phase 2 User Stories

#### US-4: Get Pricing Information
```
AS A support staff member
I WANT TO automatically get pricing when a customer asks about prices
SO THAT I can quickly provide accurate quotes
```

**Acceptance Criteria:**
- [ ] Price Agent queries Google Sheets pricelist
- [ ] Handles fuzzy product name matching
- [ ] Returns price, MOQ, and tier information
- [ ] If not found, notifies sourcing team

#### US-5: Request Artwork
```
AS A support staff member
I WANT TO automatically create an artwork request when customer needs design work
SO THAT the design team is notified without manual handoff
```

**Acceptance Criteria:**
- [ ] Extracts artwork requirements from ticket
- [ ] Posts to #artwork-requests channel
- [ ] Tags design team role
- [ ] Includes ticket reference and customer details

### Phase 3 User Stories

#### US-6: Generate Draft Reply
```
AS A support staff member
I WANT TO get a suggested reply based on agent responses
SO THAT I can quickly respond to the customer
```

#### US-7: Approve and Send Reply
```
AS A support staff member
I WANT TO review, edit, and approve replies before sending
SO THAT I maintain control over customer communication
```

---

## 7. Technical Specifications

### 7.1 Technology Stack

| Component | Technology |
|-----------|------------|
| Discord Bot | Node.js 20+, discord.js v14 |
| Backend API | Node.js 20+, Express.js |
| AI/LLM | Claude API (Anthropic) |
| Database | Supabase (PostgreSQL) |
| Hosting | Railway |
| External APIs | Freshdesk API, Google Sheets API |

### 7.2 Project Structure

```
ai-ticket-manager/
├── discord-bot/
│   ├── src/
│   │   ├── index.js                 # Bot entry point
│   │   ├── config/
│   │   │   └── config.js            # Configuration
│   │   ├── commands/
│   │   │   ├── ticket.js            # !ticket command handler
│   │   │   ├── price.js             # !price command handler
│   │   │   └── help.js              # !help command handler
│   │   ├── handlers/
│   │   │   └── messageHandler.js    # Message routing
│   │   ├── services/
│   │   │   └── backendApi.js        # Calls orchestrator backend
│   │   └── utils/
│   │       ├── embedBuilder.js      # Discord embed formatting
│   │       └── logger.js            # Logging utility
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
│
├── backend/
│   ├── src/
│   │   ├── server.js                # Express server entry
│   │   ├── config/
│   │   │   ├── config.js            # Configuration
│   │   │   └── supabase.js          # Supabase client
│   │   ├── routes/
│   │   │   ├── ticket.js            # POST /api/ticket/analyze
│   │   │   ├── price.js             # POST /api/price/query (Phase 2)
│   │   │   └── health.js            # GET /health
│   │   ├── services/
│   │   │   ├── freshdesk.js         # Freshdesk Tickets API
│   │   │   ├── classifier.js        # Intent classification (Claude)
│   │   │   ├── orchestrator.js      # Agent coordination
│   │   │   └── synthesizer.js       # Response combination (Claude)
│   │   ├── agents/
│   │   │   ├── kb-agent.js          # KB Agent HTTP client
│   │   │   ├── price-agent.js       # Price Agent HTTP client (Phase 2)
│   │   │   └── artwork-agent.js     # Artwork Agent HTTP client (Phase 2)
│   │   ├── middleware/
│   │   │   ├── auth.js              # API key validation
│   │   │   └── errorHandler.js      # Error handling
│   │   └── utils/
│   │       └── logger.js            # Logging utility
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
│
├── railway.json                      # Railway deployment config
├── README.md
└── prd.md                           # This document
```

### 7.3 Discord Bot Commands

#### `!ticket <ticket_id>`

Analyzes a Freshdesk ticket and returns comprehensive information.

**Input:**
```
!ticket 24343
```

**Output (Discord Embed):**
```
┌────────────────────────────────────────────────────────┐
│ 📋 Ticket #24343                                       │
├────────────────────────────────────────────────────────┤
│ 👤 Customer: john@company.com                          │
│ 📝 Subject: Quote for 500 custom lanyards              │
│ 📊 Status: Open | Priority: Medium                     │
├────────────────────────────────────────────────────────┤
│ 💬 CONVERSATION SUMMARY (3 emails)                     │
│                                                        │
│ • Customer initially inquired about bulk lanyard       │
│   pricing for a corporate event                        │
│ • Agent provided general information and asked         │
│   for quantity and customization details               │
│ • Customer responded with specific requirements        │
├────────────────────────────────────────────────────────┤
│ 📨 LATEST CUSTOMER MESSAGE                             │
│                                                        │
│ "We need 500 tubular polyester lanyards with our       │
│ logo printed. What colors are available and what's     │
│ the price per unit? Also, can you do pantone           │
│ color matching?"                                       │
├────────────────────────────────────────────────────────┤
│ 🎯 DETECTED INTENT: KNOWLEDGE + PRICE                  │
├────────────────────────────────────────────────────────┤
│ 📚 KNOWLEDGE BASE ANSWER                               │
│                                                        │
│ Tubular polyester lanyards are available in 15         │
│ standard colors including... Pantone matching is       │
│ available for orders of 500+ units...                  │
│                                                        │
│ Sources: [Article #12345] [Article #12367]             │
├────────────────────────────────────────────────────────┤
│ 💰 PRICING (Phase 2)                                   │
│                                                        │
│ Tubular Polyester Lanyard:                             │
│ • 500 units: $2.50/unit                                │
│ • Pantone matching: +$0.15/unit                        │
├────────────────────────────────────────────────────────┤
│ 🔗 View in Freshdesk                                   │
│ https://easyprint.freshdesk.com/a/tickets/24343        │
└────────────────────────────────────────────────────────┘
```

---

## 8. API Specifications

### 8.1 Ticket Manager Backend API

#### POST /api/ticket/analyze

Analyzes a Freshdesk ticket and coordinates agent responses.

**Request:**
```json
{
  "ticketId": "24343",
  "discordUserId": "123456789",
  "discordChannelId": "987654321",
  "options": {
    "includeKB": true,
    "includePrice": true,
    "includeArtwork": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "ticket": {
    "id": 24343,
    "subject": "Quote for 500 custom lanyards",
    "status": "open",
    "priority": "medium",
    "customer": {
      "email": "john@company.com",
      "name": "John Smith"
    },
    "createdAt": "2024-12-01T10:00:00Z",
    "updatedAt": "2024-12-04T09:30:00Z"
  },
  "analysis": {
    "threadSummary": "Customer initially inquired about...",
    "emailCount": 3,
    "latestCustomerMessage": "We need 500 tubular polyester lanyards...",
    "intents": ["KNOWLEDGE", "PRICE"],
    "extractedEntities": {
      "products": ["tubular polyester lanyard"],
      "quantity": 500,
      "customization": ["logo print", "pantone matching"]
    }
  },
  "agentResponses": {
    "knowledge": {
      "success": true,
      "answer": "Tubular polyester lanyards are available in...",
      "sources": [
        { "id": "12345", "title": "Tubular Lanyards Guide", "url": "..." }
      ],
      "confidence": 0.92
    },
    "price": {
      "success": true,
      "found": true,
      "pricing": {
        "product": "Tubular Polyester Lanyard",
        "basePrice": 2.50,
        "quantity": 500,
        "addOns": [
          { "name": "Pantone matching", "price": 0.15 }
        ],
        "totalPerUnit": 2.65
      }
    },
    "artwork": null
  },
  "synthesizedResponse": "Based on the customer's inquiry about 500 tubular polyester lanyards...",
  "freshdeskUrl": "https://easyprint.freshdesk.com/a/tickets/24343",
  "processingTime": 3420,
  "timestamp": "2024-12-04T10:00:00Z"
}
```

#### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "ai-ticket-manager-backend",
  "version": "1.0.0",
  "timestamp": "2024-12-04T10:00:00Z",
  "dependencies": {
    "freshdesk": "connected",
    "claude": "connected",
    "kbAgent": "connected",
    "priceAgent": "connected",
    "artworkAgent": "connected"
  }
}
```

### 8.2 Agent Communication Protocol

Standard request/response format for all agents.

**Agent Request:**
```json
{
  "query": "What colors are available for tubular polyester lanyards?",
  "context": {
    "ticketId": "24343",
    "customerEmail": "john@company.com",
    "conversationSummary": "Customer asking about bulk lanyard order...",
    "extractedEntities": {
      "product": "tubular polyester lanyard",
      "attribute": "colors"
    }
  },
  "requestId": "req-uuid-12345",
  "timestamp": "2024-12-04T10:00:00Z"
}
```

**Agent Response:**
```json
{
  "success": true,
  "answer": "Tubular polyester lanyards are available in 15 standard colors...",
  "confidence": 0.92,
  "sources": [
    {
      "id": "12345",
      "title": "Tubular Lanyards - Color Options",
      "url": "https://easyprint.freshdesk.com/a/solutions/articles/12345",
      "relevance": 0.95
    }
  ],
  "metadata": {
    "agentType": "knowledge",
    "processingTime": 1250,
    "model": "claude-3-sonnet"
  },
  "requestId": "req-uuid-12345",
  "timestamp": "2024-12-04T10:00:01Z"
}
```

### 8.3 KB Agent API (Existing)

**Endpoint:** `POST https://backend-production-5f2c.up.railway.app/api/bot/chat`

**Headers:**
```
Content-Type: application/json
x-bot-api-key: <KB_AGENT_API_KEY>
```

**Request:**
```json
{
  "message": "What colors are available for tubular polyester lanyards?",
  "discordUserId": "ticket-manager-orchestrator",
  "discordChannelId": "internal-agent-call",
  "sessionId": "ticket-mgr-24343-1701687600000"
}
```

**Response:**
```json
{
  "response": "Tubular polyester lanyards are available in 15 standard colors including...",
  "sources": [
    {
      "id": "12345",
      "title": "Tubular Lanyards Guide",
      "url": "https://easyprint.freshdesk.com/a/solutions/articles/12345"
    }
  ],
  "searchTerms": "tubular polyester lanyards colors",
  "articlesFound": 3,
  "sessionId": "ticket-mgr-24343-1701687600000",
  "timestamp": "2024-12-04T10:00:00Z"
}
```

---

## 9. Data Models

### 9.1 Ticket Analysis Record

Stored in Supabase for analytics and history.

```sql
CREATE TABLE ticket_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id INTEGER NOT NULL,
  ticket_subject TEXT,
  customer_email TEXT,
  
  -- Analysis results
  thread_summary TEXT,
  email_count INTEGER,
  latest_customer_message TEXT,
  detected_intents TEXT[], -- ['KNOWLEDGE', 'PRICE', 'ARTWORK']
  extracted_entities JSONB,
  
  -- Agent responses
  kb_response JSONB,
  price_response JSONB,
  artwork_response JSONB,
  synthesized_response TEXT,
  
  -- Metadata
  discord_user_id TEXT,
  discord_channel_id TEXT,
  processing_time_ms INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_analyses_ticket_id ON ticket_analyses(ticket_id);
CREATE INDEX idx_ticket_analyses_created_at ON ticket_analyses(created_at);
```

### 9.2 Agent Call Log

Track all agent calls for debugging and optimization.

```sql
CREATE TABLE agent_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES ticket_analyses(id),
  
  agent_type TEXT NOT NULL, -- 'kb', 'price', 'artwork'
  agent_url TEXT,
  
  request_payload JSONB,
  response_payload JSONB,
  
  success BOOLEAN,
  error_message TEXT,
  processing_time_ms INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_calls_analysis_id ON agent_calls(analysis_id);
CREATE INDEX idx_agent_calls_agent_type ON agent_calls(agent_type);
```

---

## 10. Implementation Phases

### Phase 1: MVP (Week 1-2)

**Goal:** Ticket fetch + summarization + KB agent integration

#### Tasks

| ID | Task | Priority | Estimate |
|----|------|----------|----------|
| 1.1 | Create Discord bot application in Developer Portal | High | 30 min |
| 1.2 | Set up project structure (discord-bot + backend) | High | 1 hour |
| 1.3 | Implement Discord bot with `!ticket` command skeleton | High | 2 hours |
| 1.4 | Implement Freshdesk Tickets API service | High | 3 hours |
| 1.5 | Implement ticket conversation fetching | High | 2 hours |
| 1.6 | Implement Claude classifier (summarize + detect intent) | High | 4 hours |
| 1.7 | Implement KB Agent connector | High | 2 hours |
| 1.8 | Implement basic orchestrator (KB only) | High | 3 hours |
| 1.9 | Implement Discord embed formatting | Medium | 2 hours |
| 1.10 | Set up Railway deployment | High | 2 hours |
| 1.11 | Set up Supabase tables | Medium | 1 hour |
| 1.12 | End-to-end testing | High | 3 hours |
| 1.13 | Documentation | Medium | 2 hours |

**Deliverables:**
- [ ] Working `!ticket <id>` command
- [ ] Ticket fetching from Freshdesk
- [ ] Thread summarization
- [ ] Intent classification
- [ ] KB Agent integration
- [ ] Formatted Discord output
- [ ] Deployed on Railway

### Phase 2: Specialist Agents (Week 3-4)

**Goal:** Add Price Agent and Artwork Agent

#### Tasks

| ID | Task | Priority | Estimate |
|----|------|----------|----------|
| 2.1 | Create price-agent project structure | High | 1 hour |
| 2.2 | Implement Google Sheets API integration | High | 4 hours |
| 2.3 | Implement fuzzy product matching | High | 3 hours |
| 2.4 | Implement Price Agent API | High | 3 hours |
| 2.5 | Deploy Price Agent to Railway | High | 1 hour |
| 2.6 | Create artwork-agent project structure | High | 1 hour |
| 2.7 | Implement artwork request extraction (Claude) | High | 3 hours |
| 2.8 | Implement Discord notification to #artwork-requests | High | 2 hours |
| 2.9 | Implement Artwork Agent API | High | 2 hours |
| 2.10 | Deploy Artwork Agent to Railway | High | 1 hour |
| 2.11 | Update orchestrator to call all agents | High | 3 hours |
| 2.12 | Implement parallel agent calling | Medium | 2 hours |
| 2.13 | Implement response synthesizer | High | 4 hours |
| 2.14 | Update Discord embed for multi-agent responses | Medium | 2 hours |
| 2.15 | End-to-end testing | High | 4 hours |

**Deliverables:**
- [ ] Price Agent deployed and integrated
- [ ] Artwork Agent deployed and integrated
- [ ] Multi-agent orchestration working
- [ ] Combined response synthesis
- [ ] Updated Discord output with all agent responses

### Phase 3: Auto-Reply (Week 5-6)

**Goal:** Generate and send replies to Freshdesk with human approval

#### Tasks

| ID | Task | Priority | Estimate |
|----|------|----------|----------|
| 3.1 | Implement draft reply composer (Claude) | High | 4 hours |
| 3.2 | Add reply preview to Discord embed | High | 2 hours |
| 3.3 | Implement Discord buttons (Approve/Edit/Reject) | High | 4 hours |
| 3.4 | Implement button interaction handlers | High | 3 hours |
| 3.5 | Implement Freshdesk reply API integration | High | 3 hours |
| 3.6 | Implement edit workflow (modal for editing) | Medium | 4 hours |
| 3.7 | Add confirmation and success/error feedback | Medium | 2 hours |
| 3.8 | Add reply logging to Supabase | Medium | 2 hours |
| 3.9 | End-to-end testing | High | 4 hours |
| 3.10 | Team training documentation | Medium | 2 hours |

**Deliverables:**
- [ ] Draft reply generation
- [ ] Approval workflow with Discord buttons
- [ ] Edit capability before sending
- [ ] Freshdesk reply integration
- [ ] Audit logging

---

## 11. Environment Configuration

### 11.1 AI Ticket Manager - Discord Bot

```env
# Discord
DISCORD_BOT_TOKEN=your-new-discord-bot-token
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_GUILD_ID=your-discord-server-id

# Backend API
BACKEND_URL=https://ticket-mgr-backend.up.railway.app
BACKEND_API_KEY=internal-api-key-for-bot

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

### 11.2 AI Ticket Manager - Backend

```env
# Server
PORT=3000
NODE_ENV=production

# API Security
API_KEY=internal-api-key-for-bot

# Freshdesk
FRESHDESK_DOMAIN=easyprint.freshdesk.com
FRESHDESK_API_KEY=your-freshdesk-api-key

# Claude (Anthropic)
ANTHROPIC_API_KEY=your-anthropic-api-key

# KB Agent (Existing)
KB_AGENT_URL=https://backend-production-5f2c.up.railway.app
KB_AGENT_API_KEY=your-existing-kb-bot-api-key

# Price Agent (Phase 2)
PRICE_AGENT_URL=https://price-agent.up.railway.app
PRICE_AGENT_API_KEY=price-agent-api-key

# Artwork Agent (Phase 2)
ARTWORK_AGENT_URL=https://artwork-agent.up.railway.app
ARTWORK_AGENT_API_KEY=artwork-agent-api-key

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-key

# Logging
LOG_LEVEL=info
```

### 11.3 Price Agent (Phase 2)

```env
# Server
PORT=3000
NODE_ENV=production

# API Security
API_KEY=price-agent-api-key

# Google Sheets
GOOGLE_SHEETS_ID=your-pricelist-sheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Claude (for response formatting)
ANTHROPIC_API_KEY=your-anthropic-api-key

# Discord (for sourcing notifications)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Logging
LOG_LEVEL=info
```

### 11.4 Artwork Agent (Phase 2)

```env
# Server
PORT=3000
NODE_ENV=production

# API Security
API_KEY=artwork-agent-api-key

# Discord
DISCORD_BOT_TOKEN=your-discord-bot-token
DISCORD_ARTWORK_CHANNEL_ID=channel-id-for-artwork-requests
DISCORD_DESIGN_TEAM_ROLE_ID=role-id-to-mention

# Claude
ANTHROPIC_API_KEY=your-anthropic-api-key

# Logging
LOG_LEVEL=info
```

---

## 12. Success Metrics

### Phase 1 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Command Response Time | < 10 seconds | Time from `!ticket` to Discord response |
| Ticket Fetch Success Rate | > 99% | Successful Freshdesk API calls |
| Intent Classification Accuracy | > 85% | Manual review of 50 random tickets |
| KB Agent Integration Success | > 95% | Successful KB API calls |

### Phase 2 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Price Lookup Success Rate | > 90% | Product found in pricelist |
| Multi-Agent Response Time | < 15 seconds | All agents respond |
| Response Synthesis Quality | > 80% helpful | User feedback |

### Phase 3 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Draft Reply Approval Rate | > 70% | Approved without edit |
| Reply Send Success Rate | > 99% | Successful Freshdesk replies |
| Time Saved per Ticket | > 5 minutes | Before/after comparison |

---

## 13. Dependencies

### External Services

| Service | Purpose | Documentation |
|---------|---------|---------------|
| Discord API | Bot interface | https://discord.com/developers/docs |
| Freshdesk API | Ticket management | https://developers.freshdesk.com/ |
| Anthropic Claude | AI/LLM | https://docs.anthropic.com/ |
| Google Sheets API | Pricelist | https://developers.google.com/sheets/api |
| Supabase | Database | https://supabase.com/docs |
| Railway | Hosting | https://docs.railway.app/ |

### Internal Dependencies

| Dependency | Type | URL |
|------------|------|-----|
| KB Agent Backend | Existing Service | https://backend-production-5f2c.up.railway.app |

### NPM Packages (Estimated)

```json
{
  "dependencies": {
    "discord.js": "^14.14.0",
    "express": "^4.18.2",
    "@anthropic-ai/sdk": "^0.10.0",
    "@supabase/supabase-js": "^2.38.0",
    "googleapis": "^128.0.0",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "winston": "^3.11.0",
    "uuid": "^9.0.0"
  }
}
```

---

## Appendix A: Claude Prompts

### Intent Classification Prompt

```
You are analyzing a customer support ticket to classify the customer's intent.

TICKET INFORMATION:
Subject: {subject}
Customer: {customer_email}

CONVERSATION HISTORY:
{conversation_history}

LATEST CUSTOMER MESSAGE:
{latest_message}

TASK:
1. Provide a brief summary of the conversation thread (2-3 sentences)
2. Identify the customer's latest request/question
3. Classify the intent(s) from these categories:
   - KNOWLEDGE: Customer asking about product information, specifications, processes, policies
   - PRICE: Customer asking about pricing, quotes, costs, discounts
   - ARTWORK: Customer requesting design work, artwork files, mockups, or design changes
   - OTHER: None of the above

4. Extract relevant entities (products, quantities, specifications mentioned)

Respond in JSON format:
{
  "threadSummary": "...",
  "latestCustomerMessage": "...",
  "intents": ["KNOWLEDGE", "PRICE"],
  "extractedEntities": {
    "products": ["tubular polyester lanyard"],
    "quantity": 500,
    "customization": ["logo print"],
    "other": []
  },
  "confidence": 0.92
}
```

### Response Synthesis Prompt

```
You are combining responses from multiple specialist agents to create a unified answer for a customer support ticket.

TICKET CONTEXT:
Subject: {subject}
Customer Question: {latest_customer_message}

AGENT RESPONSES:

Knowledge Base Agent:
{kb_response}

Price Agent:
{price_response}

Artwork Agent:
{artwork_response}

TASK:
Create a cohesive summary that:
1. Directly answers the customer's question
2. Incorporates relevant information from all agents
3. Is formatted for easy reading in Discord
4. Cites article sources where applicable [Article #ID]
5. Is professional but friendly in tone

Keep the response concise but complete.
```

---

## Appendix B: Freshdesk API Reference

### Get Ticket

```
GET https://{domain}.freshdesk.com/api/v2/tickets/{ticket_id}

Headers:
  Authorization: Basic {base64(api_key + ':X')}
  Content-Type: application/json

Response:
{
  "id": 24343,
  "subject": "Quote for 500 custom lanyards",
  "description": "...",
  "status": 2,
  "priority": 2,
  "requester_id": 123456,
  "created_at": "2024-12-01T10:00:00Z",
  "updated_at": "2024-12-04T09:30:00Z"
}
```

### Get Ticket Conversations

```
GET https://{domain}.freshdesk.com/api/v2/tickets/{ticket_id}/conversations

Response:
[
  {
    "id": 1001,
    "body": "<div>Email content...</div>",
    "body_text": "Email content...",
    "incoming": true,
    "user_id": 123456,
    "created_at": "2024-12-01T10:00:00Z"
  },
  ...
]
```

### Reply to Ticket (Phase 3)

```
POST https://{domain}.freshdesk.com/api/v2/tickets/{ticket_id}/reply

Body:
{
  "body": "Reply content..."
}
```

---

## Appendix C: Discord Embed Structure

```javascript
const embed = {
  color: 0x0099ff,
  title: `📋 Ticket #${ticketId}`,
  url: freshdeskUrl,
  fields: [
    {
      name: '👤 Customer',
      value: customerEmail,
      inline: true
    },
    {
      name: '📊 Status',
      value: status,
      inline: true
    },
    {
      name: '📝 Subject',
      value: subject,
      inline: false
    },
    {
      name: '💬 Conversation Summary',
      value: threadSummary,
      inline: false
    },
    {
      name: '📨 Latest Customer Message',
      value: latestMessage,
      inline: false
    },
    {
      name: '🎯 Detected Intent',
      value: intents.join(' + '),
      inline: false
    },
    {
      name: '📚 Knowledge Base Answer',
      value: kbAnswer,
      inline: false
    }
  ],
  timestamp: new Date().toISOString(),
  footer: {
    text: 'AI Ticket Manager'
  }
}
```

---

*End of PRD*
