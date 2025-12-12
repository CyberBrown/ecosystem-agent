# Ecosystem Agent - Agent Instructions

<!-- Developer Guides MCP Setup v1.1.0 - Check for updates: docs/CLAUDE-MD-SETUP.md -->

## Project Overview

Autonomous agent system that runs daily (3am EST) to maintain documentation and answer cross-team questions for the Nexus, DE, and Mnemo teams.

**Core responsibilities:**
- Answer Q&A board questions using Mnemo's context cache
- Review answers and extract actionable insights
- Check MCP developer guide updates
- Generate/update action plans
- Create GitHub PRs with changes

## Glossary

| Term | Full Name | Description |
|------|-----------|-------------|
| **DE** | Distributed Elections | Queue and priority system for managing LLM requests |
| **Mnemo** | - | Short-term working memory; provides context caching via Gemini |
| **Nexus** | - | Backend service for communication/time management |
| **MCP** | Model Context Protocol | Protocol for AI assistant context management |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Worker (Cron: 3am EST daily)                    │
├─────────────────────────────────────────────────────────────┤
│  1. Load team docs into Mnemo (shared cache)                │
│  2. For each team (Nexus, DE, Mnemo):                       │
│     - Answer Q&A board questions                            │
│     - Review answers → update docs                          │
│     - Check MCP updates → apply to docs                     │
│     - Update action plan                                    │
│  3. Create GitHub PR (one commit per team)                  │
│  4. On failure: Create GitHub issue                         │
└─────────────────────────────────────────────────────────────┘
```

### Dependencies

```
ecosystem-agent  →  HTTP  →  Mnemo CF Worker  →  Gemini API
                                    ↑
                          GEMINI_API_KEY (on Mnemo)
```

**Important**: This agent does NOT call Gemini directly. It calls Mnemo's HTTP API, which handles all Gemini interactions.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Language | TypeScript |
| Framework | Hono |
| Deployment | Cloudflare Workers |
| Scheduling | Cloudflare Cron Triggers |

## File Structure

```
src/
├── index.ts      # Main worker, cron handler, orchestration
├── agent.ts      # TeamAgent - core logic for each team
├── mnemo.ts      # MnemoClient - HTTP client for Mnemo API
├── github.ts     # GitHubClient - branches, commits, PRs, issues
└── types.ts      # Shared TypeScript types
```

## Commands

```bash
# Development
bun install                    # Install dependencies
bun run dev                    # Run locally with wrangler

# Testing
bun run type-check             # TypeScript check
curl -X POST http://localhost:8787/trigger  # Manual trigger

# Deployment
bun run deploy                 # Deploy to Cloudflare
```

## Environment & Secrets

```bash
# Required
wrangler secret put GITHUB_TOKEN  # repo scope for PRs/issues

# Optional
wrangler secret put SLACK_WEBHOOK_URL  # Cost alerts
```

**No Mnemo/Gemini API key needed** - Mnemo handles all Gemini authentication internally. Clients just call Mnemo's HTTP endpoints.

## Mnemo Integration

The `MnemoClient` (`src/mnemo.ts`) calls Mnemo's HTTP endpoints:

| Endpoint | Purpose |
|----------|---------|
| `POST /tools/context_load` | Load repos into shared cache |
| `POST /tools/context_query` | Query cache with questions |
| `POST /tools/context_list` | List active caches |
| `POST /tools/context_stats` | Get usage/cost stats |

**Base URL**: `https://mnemo.solamp.workers.dev`

**Cache alias**: `ecosystem-agent-shared` (24h TTL)

## Known Issues

### Gemini API Error 1042
If Mnemo returns `error code: 1042` (RESOURCE_EXHAUSTED):
- This is a **Mnemo infrastructure issue**, not an ecosystem-agent issue
- Fix: Update `GEMINI_API_KEY` on Mnemo's CF Worker
- See: `/home/chris/projects/mnemo/packages/cf-worker`

## Developer Guidelines (MCP Server)

### Required: Check Before Implementing

ALWAYS search the developer guides before:
- Writing new functions or modules
- Implementing error handling
- Adding validation logic
- Creating API endpoints

### Quick Reference

| Task | Search Query |
|------|-------------|
| Input validation | `query="zod validation"` |
| Error handling | `query="error classes"` |
| CF Workers | `query="cloudflare workers"` |
| Testing patterns | `query="unit test"` |

### How to Access

```
mcp__developer-guides__search_developer_guides query="validation"
mcp__developer-guides__get_guide guideId="cloudflare-workers-guide"
mcp__developer-guides__list_guides
```

### Relevant Guides

| Guide | Use For |
|-------|---------|
| `cloudflare-workers-guide` | Workers patterns, cron triggers, secrets |
| `guide-01-fundamentals` | Code organization, error handling |
| `guide-07-security` | Validation, auth, secrets |

## Deployment Info

| Resource | Value |
|----------|-------|
| Worker URL | https://ecosystem-agent.solamp.workers.dev |
| Cron | `0 8 * * *` (3am EST / 8am UTC) |
| Health | `GET /health` |
| Manual trigger | `POST /trigger` |

## Related Projects

| Project | Path | Relationship |
|---------|------|--------------|
| Mnemo | `/home/chris/projects/mnemo` | Context caching service (dependency) |
| Nexus | `/home/chris/nexus` | Team being managed |
| DE | `/home/chris/distributed-electrons` | Team being managed |

## References

- [README.md](./README.md) - Full documentation
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Deployment history, known issues
- [Cross-Team Q&A Board](https://github.com/CyberBrown/nexus/blob/main/docs/CROSS-TEAM-QA-BOARD.md)
