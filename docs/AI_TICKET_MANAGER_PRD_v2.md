# AI Ticket Manager - Product Requirements Document v2.0

## Document Info
| Field | Value |
|-------|-------|
| Version | 2.0 |
| Last Updated | December 11, 2025 |
| Status | In Progress |
| Author | Darren / Claude |

---

## 1. Executive Summary

### 1.1 Project Overview
The AI Ticket Manager is a multi-agent system that automates Freshdesk ticket analysis and response generation for EasyPrint's customer support team. Staff type `!ticket <id>` in Discord to receive intelligent, multi-source responses combining knowledge base information, pricing data, product availability, and artwork guidance.

### 1.2 Business Context
- **Company:** EasyPrint (corporate gift printing)
- **Volume:** 50-100 tickets/day
- **Team:** 5-7 support staff
- **Platform:** Freshdesk Pro (full API access)
- **Products:** 300-400 products, adding 5 new/week

### 1.3 Problem Statement
Support staff currently:
- Manually read through email threads to understand requests
- Switch between Freshdesk, knowledge base, pricelist spreadsheets
- Make sourcing decisions (local vs China) based on experience
- Handle terminology mismatches (customers say "badge case", we call it "card holder")
- Provide inconsistent responses across different staff members

### 1.4 Solution
A Discord-based multi-agent system that:
1. Fetches and summarizes Freshdesk tickets
2. Classifies customer intent (Knowledge, Price, Availability, Artwork)
3. Routes to specialist AI agents for domain-specific answers
4. Combines responses into unified, actionable output
5. Recommends sourcing options (Local vs China) based on quantity and urgency

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
                              DISCORD SERVER
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  KB Discord Bot │      │ Ticket Manager  │      │ Price Agent Bot │
│    (EXISTS)     │      │   Bot (NEW)     │      │     (NEW)       │
│                 │      │                 │      │                 │
│  !kb <query>    │      │  !ticket <id>   │      │  !price <query> │
└─────────────────┘      └────────┬────────┘      └────────┬────────┘
                                  │                        │
                                  ▼                        │
                    ┌─────────────────────────┐            │
                    │    TICKET MANAGER       │            │
                    │    BACKEND              │            │
                    │    (Orchestrator)       │            │
                    └───────────┬─────────────┘            │
                                │                          │
        ┌───────────────────────┼───────────────────────┬──┘
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│   KB AGENT    │      │ PRODUCT AGENT │      │  PRICE AGENT  │
│   (EXISTS)    │      │    (NEW)      │      │    (NEW)      │
│               │      │               │      │               │
│ Freshdesk KB  │      │ Website +     │      │  Pricelist    │
│ Process info  │      │ Google Sheet  │      │  MOQ & Price  │
└───────────────┘      └───────────────┘      └───────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   Freshdesk KB         Magento 2 API +         Google Sheets
                        Product Intelligence     (Pricelist)
                        Sheet (Google Sheets)
```

### 2.2 Data Sources

| Data Source | Owner | Contains | Used By |
|-------------|-------|----------|---------|
| Freshdesk KB | Existing | Process info, specs, FAQs | KB Agent |
| Magento 2 Website | Existing | Products, categories, colors, images | Product Agent |
| Product Intelligence Sheet | NEW | Synonyms, sourcing info, supplier data | Product Agent |
| Pricelist (Google Sheets) | Existing | MOQ, pricing tiers, lead times | Price Agent |

### 2.3 Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Multi-agent (not monolithic) | Independent scaling, separation of concerns |
| Agent Communication | HTTP REST APIs | Simple, stateless, language-agnostic |
| Product Data | Website = source of truth | Already maintained, SEO-optimized |
| Internal Data | Google Sheets | Assistant already uses Sheets, easy to update |
| Pricelist Storage | Google Sheets (existing) | Already maintained, familiar workflow |
| Hosting | Railway | Already using for KB bot |
| LLM | Claude (Anthropic) | Already using, good performance |

---

## 3. Agent Specifications

### 3.1 Intent Classification

The orchestrator classifies customer messages into intents:

| Intent | Trigger Patterns | Agent(s) Called |
|--------|------------------|-----------------|
| **KNOWLEDGE** | "what is", "how does", "process", "specifications" | KB Agent |
| **AVAILABILITY** | "do you have", "is X available", "what colors", "do you offer" | Product Agent |
| **PRICE** | "how much", "price", "cost", "MOQ", "minimum order", "quote" | Price Agent |
| **ARTWORK** | "design", "artwork", "logo", "mockup", "vector" | Artwork Agent |
| **MIXED** | Multiple patterns detected | Multiple Agents (parallel) |

### 3.2 KB Agent (EXISTS)

**Status:** ✅ Deployed and operational

**Purpose:** Answer knowledge-based questions about processes, specifications, and general information.

**Infrastructure:**
| Component | URL |
|-----------|-----|
| Discord Bot | `discord-bot-production-76e9.up.railway.app` |
| MCP Server | `mcp-server-production-8b5a.up.railway.app` |
| Backend API | `backend-production-5f2c.up.railway.app` |

**API Endpoint:**
```
POST https://backend-production-5f2c.up.railway.app/api/bot/chat

Request:
{
  "message": "What colors are available for lanyards?",
  "discordUserId": "ticket-manager-orchestrator",
  "discordChannelId": "internal-agent-call",
  "sessionId": "ticket-mgr-12345"
}

Response:
{
  "response": "Lanyards are available in...",
  "sources": [{ "id": "123", "title": "...", "url": "..." }],
  "searchTerms": "lanyards colors",
  "articlesFound": 3
}
```

---

### 3.3 Product Agent (NEW)

**Status:** 🔄 To be built

**Purpose:** Answer product availability questions, handle synonyms, provide sourcing recommendations.

#### 3.3.1 Data Sources

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCT AGENT DATA FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐      ┌─────────────────────────────┐  │
│  │   MAGENTO 2 API     │      │   PRODUCT INTELLIGENCE      │  │
│  │   (Website)         │      │   (Google Sheet)            │  │
│  │                     │      │                             │  │
│  │  Source of truth:   │      │  Source of truth:           │  │
│  │  • Product names    │      │  • Synonyms                 │  │
│  │  • Categories       │      │  • Local sourcing info      │  │
│  │  • Colors shown     │      │  • China sourcing info      │  │
│  │  • Descriptions     │      │  • Supplier details         │  │
│  │  • Images           │      │  • Lead times               │  │
│  │                     │      │  • Internal notes           │  │
│  └──────────┬──────────┘      └──────────────┬──────────────┘  │
│             │                                │                  │
│             └────────────────┬───────────────┘                  │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                          │
│                    │  PRODUCT AGENT  │                          │
│                    └─────────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.3.2 Product Intelligence Sheet Structure

**Sheet 1: Product Intelligence**

| Section | Columns | Description |
|---------|---------|-------------|
| **PRODUCT INFO** (Red) | A-E | Basic product details from website |
| **LOCAL SOURCING** (Blue) | F-I | SG/MY suppliers for rush/small orders |
| **CHINA FACTORY** (Green) | J-N | China production for bulk orders |
| **OTHER** (Purple) | O-P | Notes and timestamps |

**Column Details:**

| Column | Header | Description | Filled By |
|--------|--------|-------------|-----------|
| A | Product Name | Exact name from website | Scraper/Assistant |
| B | Category | Product category | Scraper/Assistant |
| C | Website URL | Product page path | Scraper/Assistant |
| D | Other Names | Customer synonyms (comma-separated) | Assistant |
| E | Colors on Website | Standard colors shown | Scraper/Assistant |
| F | Local Supplier | Dropdown: In-house, MyGift, Ideahouse, Axxel, Other | Assistant |
| G | Local MOQ | Minimum order from local supplier | Assistant |
| H | Local Lead Time | Dropdown: 1-3, 3-5, 5-10, 7-14 days | Assistant |
| I | Local Colors | Colors available from local supplier | Assistant |
| J | China Available? | Dropdown: YES, NO | Assistant |
| K | China MOQ | Minimum order from China factory | Assistant |
| L | China Air | ✓ if available (10-15 days) | Assistant |
| M | China Sea | ✓ if available (20-35 days) | Assistant |
| N | China Colors | Usually "Any Pantone" | Assistant |
| O | Notes | Internal notes | Anyone |
| P | Last Updated | Date of last update | Assistant |

**Sheet 2: Synonyms**

| Column | Header | Example |
|--------|--------|---------|
| A | Customer Says | badge case |
| B | We Call It | Card Holder |
| C | Notes | Very common term |

**Sheet 3: Suppliers**

Reference list of all suppliers with locations, lead times, and best-use cases.

**Sheet 4: Sourcing Guide**

Decision guide for when to use Local vs China sourcing.

#### 3.3.3 Sourcing Decision Logic

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOURCING DECISION TREE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Customer Request                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────┐                        │
│  │ Is quantity >= China MOQ?           │                        │
│  │ AND customer NOT in rush?           │                        │
│  └────────────────┬────────────────────┘                        │
│                   │                                             │
│          ┌───────┴───────┐                                      │
│          │               │                                      │
│         YES              NO                                     │
│          │               │                                      │
│          ▼               ▼                                      │
│   ┌─────────────┐  ┌─────────────────────────────────────┐     │
│   │   CHINA     │  │  LOCAL (SG/MY Suppliers)            │     │
│   │   FACTORY   │  │                                     │     │
│   │             │  │  In-house: 1-3 days (very urgent)   │     │
│   │ Air: 10-15d │  │  MyGift/Ideahouse/Axxel: 5-10 days  │     │
│   │ Sea: 20-35d │  │                                     │     │
│   │             │  │  Higher unit price, lower MOQ       │     │
│   │ Best price  │  │                                     │     │
│   └─────────────┘  └─────────────────────────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.3.4 Query Flow Example

```
Customer: "Do you have white badge case? Need 200 pcs, quite urgent"

┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: SYNONYM LOOKUP                                          │
│ Sheet: Synonyms                                                 │
│ "badge case" → "Card Holder"                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: WEBSITE SEARCH                                          │
│ Magento 2 API: Search "Card Holder"                             │
│ Found: Deluxe Leather Card Holder, Acrylic Card Holder, etc.    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: SOURCING LOOKUP                                         │
│ Sheet: Product Intelligence                                     │
│                                                                 │
│ Deluxe Leather Card Holder:                                     │
│ • Local: Ideahouse, MOQ 50, white available ✓                   │
│ • China: MOQ 500 (qty 200 below China MOQ)                      │
│                                                                 │
│ Decision: Qty 200 + Urgent → LOCAL                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: GENERATE RESPONSE                                       │
│                                                                 │
│ "Yes! We have white card holders (badge cases).                 │
│  For 200 pieces with urgent delivery:                           │
│  • Supplier: Ideahouse                                          │
│  • Lead time: 5-10 working days                                 │
│  • Let me get you pricing."                                     │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.3.5 API Endpoints

```
POST /api/product/availability
{
  "query": "white badge case",
  "quantity": 200,
  "urgent": true
}

Response:
{
  "success": true,
  "data": {
    "found": true,
    "matched_term": "Card Holder",
    "synonym_used": "badge case",
    "products": [
      {
        "name": "Deluxe Leather Card Holder",
        "url": "/products/deluxe-leather-card-holder",
        "requested_color": "white",
        "color_available": true,
        "sourcing_recommendation": "local",
        "sourcing_details": {
          "supplier": "Ideahouse",
          "moq": 50,
          "lead_time": "5-10 days",
          "reason": "Quantity 200 below China MOQ (500), urgent delivery requested"
        }
      }
    ]
  }
}
```

---

### 3.4 Price Agent (NEW)

**Status:** 🔄 To be built (PRD exists: PRICE_AGENT_PRD.md)

**Purpose:** Query pricing database for MOQs and pricing information.

**Access Methods:**
1. Via `!ticket` command → Orchestrator auto-detects pricing questions
2. Via `!price` command → Staff manually queries pricing directly

**Data Source:** Google Sheets pricelist (existing) or Supabase (migrated)

**Key Features:**
- Natural language query parsing with Claude
- Fuzzy product matching
- Quantity-based tier lookup
- MOQ identification
- Lead time variants (local, air, sea)

**Example Query:**
```
!price canvas tote bag 500 pcs

Response:
┌────────────────────────────────────────────────────────────────┐
│ 💰 Price: A4 Canvas Tote Bag                                   │
├────────────────────────────────────────────────────────────────┤
│ 📦 Product: A4 Canvas Cream Tote Bag                           │
│ 📏 Size: 33cmH x 30cmL                                         │
│ 🖨️ Print: silkscreen print - 1c x 0c                           │
│ 🚚 Lead Time: 5-10 working days (Local)                        │
├────────────────────────────────────────────────────────────────┤
│ 💵 Pricing for 500 units:                                      │
│    Unit Price: $2.01                                           │
│    Total: $1,005.00                                            │
├────────────────────────────────────────────────────────────────┤
│ 📊 Quantity Tiers:                                             │
│    30 pcs: $4.42/pc (MOQ)                                      │
│    100 pcs: $2.75/pc                                           │
│    500 pcs: $2.01/pc ← Your quantity                           │
│    1000 pcs: $1.85/pc                                          │
└────────────────────────────────────────────────────────────────┘
```

---

### 3.5 Artwork Agent (NEW)

**Status:** 🔄 To be built

**Purpose:** Handle design/artwork requests by notifying the design team.

**Workflow:**
1. Detect artwork-related intent in ticket
2. Extract artwork requirements
3. Post to #artwork-requests Discord channel
4. Tag design team
5. Track request status

**Example:**
```
Ticket: "Can you create a mockup with our logo? Attached is our vector file."

AI Action:
├── Detect: ARTWORK intent
├── Extract: Mockup request, logo attachment
├── Post to #artwork-requests:
│   "🎨 Artwork Request from Ticket #81309
│    Customer: company@email.com
│    Request: Create mockup with customer logo
│    Attachment: vector file
│    @design-team"
└── Response: "I've forwarded your artwork request to our design team. 
              They'll prepare a mockup and get back to you shortly."
```

---

## 4. Orchestrator Logic

### 4.1 Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  !ticket 81309                                                  │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                            │
│  │ Fetch Ticket    │ ← Freshdesk API                            │
│  │ from Freshdesk  │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ Summarize       │ ← Claude                                   │
│  │ Conversation    │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ Classify        │ ← Claude                                   │
│  │ Intent(s)       │   KNOWLEDGE | AVAILABILITY | PRICE |       │
│  └────────┬────────┘   ARTWORK | MIXED                          │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ Route to        │ ← Parallel execution for MIXED             │
│  │ Agent(s)        │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ Synthesize      │ ← Combine responses with priority          │
│  │ Response        │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ Format &        │ ← Discord embed                            │
│  │ Send to Discord │                                            │
│  └─────────────────┘                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Response Priority

When multiple agents return data, synthesize with this priority:

```
PRIORITY 1: PRICE AGENT DATA
├── Specific MOQs and prices
├── Quantity tier breakdowns
└── This is what customer typically NEEDS most

PRIORITY 2: PRODUCT AGENT DATA
├── Availability confirmation
├── Sourcing recommendation (Local vs China)
└── Color/variant availability

PRIORITY 3: KB AGENT DATA
├── Product specifications
├── Manufacturing process
└── Adds context, doesn't replace pricing

PRIORITY 4: ARTWORK AGENT DATA
├── Request confirmation
├── Assignment info
└── Timeline

FALLBACK: If Price Agent has no data
└── Use Product/KB info + "Let me get you a custom quote"
```

### 4.3 Example Synthesized Response

```
┌────────────────────────────────────────────────────────────────┐
│ 📋 Ticket #81309                                               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ 📨 Latest Customer Message                                     │
│ "Do you also have a white badge case also?"                    │
│                                                                │
│ 🎯 Detected Intent: AVAILABILITY + PRICE                       │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ 📦 Product Agent                                               │
│ ✓ Found: Card Holders (matched "badge case")                   │
│ ✓ White available from Ideahouse (Local)                       │
│ ✓ Recommendation: Local sourcing (qty 200, urgent)             │
│   Lead time: 5-10 working days                                 │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ 💰 Price Agent                                                 │
│ Card Holder (Hard Plastic):                                    │
│ • MOQ: 100 pcs @ $0.50/pc                                      │
│ • 200 pcs @ $0.45/pc = $90.00 total                            │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ 💬 Suggested Response:                                         │
│                                                                │
│ "Yes! We have white card holders (badge cases).                │
│                                                                │
│  For 200 pieces:                                               │
│  • Price: $0.45 each ($90.00 total)                            │
│  • Lead time: 5-10 working days                                │
│                                                                │
│  Since you're already ordering lanyards, I can combine         │
│  these into one shipment. Would you like me to add             │
│  this to your quote?"                                          │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ [✅ Send Response] [✏️ Edit] [❌ Cancel]                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. Technical Implementation

### 5.1 Project Structure

```
ai-ticket-manager/
├── discord-bot/
│   ├── src/
│   │   ├── index.js
│   │   ├── commands/
│   │   │   ├── ticket.js
│   │   │   └── help.js
│   │   └── services/
│   │       └── backendApi.js
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── services/
│   │   │   ├── freshdesk.js
│   │   │   ├── classifier.js
│   │   │   ├── orchestrator.js
│   │   │   └── synthesizer.js
│   │   └── agents/
│   │       ├── kb-agent.js
│   │       ├── product-agent.js
│   │       ├── price-agent.js
│   │       └── artwork-agent.js
│   └── package.json
│
└── railway.json

price-agent/
├── discord-bot/
│   └── src/
│       ├── index.js
│       └── commands/
│           └── price.js
├── backend/
│   └── src/
│       ├── server.js
│       └── services/
│           ├── sheets.js
│           ├── parser.js
│           └── claude.js
└── railway.json
```

### 5.2 Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ |
| Discord | discord.js v14 |
| HTTP Server | Express.js |
| LLM | Claude (Anthropic API) |
| Website API | Magento 2 REST API |
| Sheets Access | Google Sheets API |
| Database | Supabase (for Price Agent) |
| Hosting | Railway |

### 5.3 Environment Variables

**Ticket Manager Backend:**
```env
PORT=3000
API_KEY=xxx

# Freshdesk
FRESHDESK_DOMAIN=easyprint.freshdesk.com
FRESHDESK_API_KEY=xxx

# LLM
ANTHROPIC_API_KEY=xxx

# Agents
KB_AGENT_URL=https://backend-production-5f2c.up.railway.app
KB_AGENT_API_KEY=xxx
PRODUCT_AGENT_URL=https://product-agent-backend.up.railway.app
PRODUCT_AGENT_API_KEY=xxx
PRICE_AGENT_URL=https://price-agent-backend.up.railway.app
PRICE_AGENT_API_KEY=xxx

# Google Sheets (Product Intelligence)
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx
GOOGLE_PRIVATE_KEY=xxx
PRODUCT_INTELLIGENCE_SHEET_ID=xxx

# Magento 2
MAGENTO_BASE_URL=https://www.easyprint.sg
MAGENTO_ACCESS_TOKEN=xxx
```

**Price Agent Backend:**
```env
PORT=3001
PRICE_AGENT_API_KEY=xxx
ANTHROPIC_API_KEY=xxx

# Pricelist
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx
GOOGLE_PRIVATE_KEY=xxx
PRICELIST_SHEET_ID=xxx

# Or Supabase (if migrated)
SUPABASE_URL=xxx
SUPABASE_SERVICE_KEY=xxx
```

---

## 6. Implementation Phases

### Phase 1: MVP ✅ COMPLETED
- [x] Create Discord bot with `!ticket` command
- [x] Implement Freshdesk Tickets API integration
- [x] Implement Claude intent classifier
- [x] Integrate with existing KB Agent via HTTP
- [x] Deploy to Railway

### Phase 2: Specialist Agents 🔄 IN PROGRESS
- [x] Design Product Intelligence Sheet structure
- [x] Create Google Sheet template
- [ ] Scrape Magento 2 → Populate sheet with 300-400 products
- [ ] Build Product Agent (Website + Sheet integration)
- [ ] Build Price Agent (Pricelist integration)
- [ ] Build Artwork Agent (Discord notifications)
- [ ] Update orchestrator to call all agents
- [ ] Implement response synthesizer with priority logic

### Phase 3: Auto-Reply (Future)
- [ ] Generate draft replies from synthesized responses
- [ ] Add Discord approval buttons (✅ Approve / ✏️ Edit / ❌ Cancel)
- [ ] Integrate Freshdesk reply API
- [ ] Human-in-the-loop workflow

### Phase 4: Sourcing Automation (Future)
- [ ] Taobao Agent for product searches
- [ ] WhatsApp Supplier Agents (Ideahouse, MyGift, WeChat, Axxel)
- [ ] Sourcing Manager service

---

## 7. Maintenance & Operations

### 7.1 Product Intelligence Sheet Maintenance

| Task | Owner | Frequency | Time |
|------|-------|-----------|------|
| Add new products | VA (Philippines) | Weekly (+5 products) | ~3 min/product |
| Add synonyms | VA / Staff | As needed | 30 sec each |
| Update sourcing info | VA | When supplier changes | As needed |
| Review sheet accuracy | Darren | Monthly | 30 min |

### 7.2 Monitoring

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Response time | <5 seconds | >10 seconds |
| Agent success rate | >95% | <90% |
| Intent classification accuracy | >90% | <80% |

---

## 8. Appendices

### Appendix A: Common Synonyms

| Customer Says | We Call It |
|---------------|------------|
| badge case | Card Holder |
| badge holder | Card Holder |
| ID holder | Card Holder |
| name tag holder | Card Holder |
| name card | Business Card |
| thumb drive | USB Flash Drive |
| pendrive | USB Flash Drive |
| totebag | Tote Bag |
| eco bag | Non-Woven Tote Bag |
| neck strap | Lanyard |

### Appendix B: Supplier Reference

| Supplier | Location | Lead Time | Best For |
|----------|----------|-----------|----------|
| In-house | Singapore | 1-3 days | Very urgent, small qty |
| MyGift | Singapore | 5-10 days | Bags, apparel, drinkware |
| Ideahouse | Singapore | 5-10 days | Card holders, leather, premium |
| Axxel | Malaysia | 5-10 days | Lanyards, badges, events |
| China Factory | China | 10-15 days (air), 20-35 days (sea) | Bulk orders, custom colors |

### Appendix C: Related Documents

| Document | Description |
|----------|-------------|
| `PRICE_AGENT_PRD.md` | Detailed Price Agent specifications |
| `DATA_IMPORT_INSTRUCTIONS.md` | CSV parsing and import instructions |
| `Product_Intelligence_Template_v2.xlsx` | Google Sheet template |

---

## 9. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-10 | Initial PRD with KB Agent integration |
| 2.0 | 2025-12-11 | Added Product Agent, sourcing logic, Google Sheet structure |
