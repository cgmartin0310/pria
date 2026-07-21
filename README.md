# Pria

**AI-powered electronic prior authorization for PT/OT/ST practices.**

Pria automates the prior authorization workflow for physical therapy, occupational therapy, and speech therapy practices. It uses AI to extract clinical information, generate medical necessity summaries, build X12 278 transactions, and submit to payers — turning a 20-minute manual process into a 2-minute automated one.

## Features

- **AI Clinical Extraction** — Reads therapist notes and auto-populates PA requests with diagnosis codes, CPT codes, and functional limitation data
- **Medical Necessity Generation** — AI drafts payer-specific clinical justification using evidence-based guidelines
- **Payer Rules Engine** — Knows which payers require auth for which services, so you never submit unnecessarily
- **X12 278 Submission** — Generates and submits electronic PA requests through clearinghouse integration
- **Status Tracking** — Real-time dashboard showing pending, approved, denied, and expiring authorizations
- **Re-Auth Alerts** — Proactive notifications when patients are approaching visit limits
- **Denial Management** — AI-assisted appeal letter generation with clinical documentation
- **FHIR R4 Ready** — Built for CMS-0057-F compliance (2027 mandate)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui |
| Backend | Node.js, TypeScript, Fastify |
| Database | PostgreSQL, Drizzle ORM |
| Queue | Redis, BullMQ |
| AI | Anthropic Claude API |
| EDI | X12 278 (clearinghouse integration) |
| Auth | Clerk (JWT verification + per-practice multi-tenancy) |
| Monorepo | pnpm workspaces, Turborepo |

## Project Structure

```
pria/
├── packages/
│   ├── frontend/        # React SPA — dashboard, auth management, patient views
│   ├── backend/         # Fastify API — routes, services, jobs, database
│   └── shared/          # Shared TypeScript types, constants, enums
├── turbo.json           # Turborepo config
├── pnpm-workspace.yaml  # pnpm workspace definition
└── .env.example         # Environment variables template
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+
- Redis 7+

### Setup

```bash
# Clone the repo
git clone https://github.com/cgmartin0310/pria.git
cd pria

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your database, Redis, and API credentials

# Run database migrations
pnpm --filter backend db:migrate

# Start development servers
pnpm dev
```

This starts:
- **Frontend** at `http://localhost:5173`
- **Backend** at `http://localhost:3002`

### Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ANTHROPIC_API_KEY` | Claude API key for AI features |
| `CLERK_SECRET_KEY` | Clerk backend secret — verifies session JWTs on the API |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk frontend key — required for the React app to boot |
| `AVAILITY_API_KEY` | Clearinghouse API credentials |

## Architecture

### Data Flow

```
Therapist → Clinical Notes → AI Extraction → PA Request (278) → Clearinghouse → Payer
                                                                        ↓
                                    Dashboard ← Status Updates ← Response (278)
```

### Key Services

- **AI Service** — Claude API integration for clinical document extraction and medical necessity generation
- **EDI Service** — X12 278 request/response generation and parsing
- **PA Service** — Prior authorization business logic, status management, re-auth monitoring
- **Payer Service** — Payer rules engine, requirements lookup, connectivity management

## License

Proprietary. All rights reserved.
