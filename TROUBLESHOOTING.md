# Troubleshooting & Implementation Notes

## Deployment History

### 2025-12-06: Initial Deployment & Fixes

#### Issue 1: Cron Schedule
**Problem**: Worker deployed at 04:14 UTC, missing the 3am UTC scheduled run.
**Fix**: Changed cron from `0 3 * * *` (3am UTC) to `0 8 * * *` (3am EST/8am UTC)
**Note**: During DST (March-November), this runs at 4am EDT. For true 3am year-round, adjust manually or use two schedules.

#### Issue 2: Wrong Mnemo API Endpoints
**Problem**: Ecosystem-agent was calling non-existent REST endpoints:
- ❌ Called: `https://api.mnemo.dev/context/load`, `/context/query`, etc.
- ❌ Used: Authorization Bearer tokens (auth not enabled)

**Root Cause**: Mnemo uses MCP (Model Context Protocol), not traditional REST API.

**Fix Applied**: Updated `src/mnemo.ts` to use correct endpoints:
- ✅ Base URL: `https://mnemo.solamp.workers.dev`
- ✅ Endpoints: `/tools/context_load`, `/tools/context_query`, `/tools/context_list`, `/tools/context_stats`
- ✅ Method: POST (not GET)
- ✅ Removed: Authorization headers (not required - no MNEMO_AUTH_TOKEN configured)
- ✅ Updated: Response parsing to handle MCP tool format: `{ content: [{ type: "text", text: "..." }] }`

#### Issue 3: Local File Paths
**Problem**: Worker tried to load local filesystem paths:
```javascript
sources: [
  '/home/chris/nexus/docs',
  '/home/chris/nexus/ROADMAP.md',
  // ... etc
]
```

**Root Cause**: Cloudflare Workers don't have filesystem access.

**Fix Applied**: Changed to GitHub repository URLs:
```javascript
sources: [
  'https://github.com/CyberBrown/nexus',
  'https://github.com/CyberBrown/mnemo',
  'https://github.com/CyberBrown/distributed-electrons',
]
```

#### Issue 4: Gemini API Error 1042
**Current Status**: ❌ BLOCKED

**Problem**: Mnemo worker returns `error code: 1042` (RESOURCE_EXHAUSTED) when trying to create/query caches.

**Cause**: The Mnemo Cloudflare Worker (`mnemo.solamp.workers.dev`) has a `GEMINI_API_KEY` secret configured, but it's either:
- Invalid or expired
- Missing billing/quota
- Lacking context caching permissions

**Investigation Results**:
```bash
# Mnemo worker secrets:
$ cd /home/chris/mnemo/packages/cf-worker && bunx wrangler secret list
[{ "name": "GEMINI_API_KEY", "type": "secret_text" }]

# Existing caches (all expired):
- nexus: expired 2025-12-06T17:29:21Z
- mnemo: expired 2025-12-06T17:29:17Z
- distributed-electrons: expired 2025-12-06T17:29:26Z
```

**Next Steps**:
1. Verify `GEMINI_API_KEY` is valid and has billing enabled
2. Ensure API key has context caching permissions
3. Check Gemini API quota limits

**To Fix**:
```bash
cd /home/chris/mnemo/packages/cf-worker
bunx wrangler secret put GEMINI_API_KEY
# Enter a valid Gemini API key with:
# - Billing enabled
# - Context caching permissions
# - Active quota
```

## Required Secrets

### Ecosystem Agent Secrets

#### 1. GITHUB_TOKEN (Required)
**Purpose**: Create branches, commits, PRs, and issues in team repositories.

**Scopes Needed**: `repo` (full repository access)

**Setup**:
```bash
bunx wrangler secret put GITHUB_TOKEN
# Get token from: https://github.com/settings/tokens
```

#### 2. MNEMO_API_KEY (Not Needed)
**Status**: Removed - ecosystem-agent doesn't need any API key for Mnemo.

Mnemo handles all Gemini authentication internally. Clients just call Mnemo's HTTP endpoints without authentication (unless Mnemo's `MNEMO_AUTH_TOKEN` is configured).

#### 3. SLACK_WEBHOOK_URL (Optional)
**Purpose**: Cost alerts when monthly spend exceeds $50.

**Status**: Not needed at this time.

## Architecture Notes

### Cloudflare Worker + MCP Integration

**Challenge**: Cloudflare Workers run in the cloud, but MCP servers typically run locally via stdio.

**Current Approach**:
- Mnemo exposes MCP tools via HTTP endpoints (`/tools/:toolName`)
- Ecosystem-agent (Cloudflare Worker) calls these HTTP endpoints
- Mnemo worker internally uses Gemini API for context caching

**Key Insight**: The Mnemo **Cloudflare Worker** is essentially an "HTTP wrapper" around the MCP server, making MCP tools accessible to other Cloudflare Workers.

### Alternative Architectures Considered

**Option A: Local Process** (NOT chosen)
- Run ecosystem-agent on local machine/server
- Access Mnemo via native MCP protocol
- Use system cron for scheduling
- ❌ Requires always-on machine
- ❌ No serverless benefits

**Option B: Cloudflare Worker** (CHOSEN)
- Serverless, automatic execution
- Uses Mnemo's HTTP/MCP endpoints
- Scheduled via Cloudflare Cron
- ✅ No infrastructure to maintain
- ✅ Built-in monitoring/logging

## Testing

### Manual Trigger
```bash
curl -X POST https://ecosystem-agent.solamp.workers.dev/trigger
```

### Check Logs
```bash
bunx wrangler tail
```

### Verify Mnemo Access
```bash
# List caches
curl -X POST https://mnemo.solamp.workers.dev/tools/context_list \
  -H "Content-Type: application/json" \
  -d '{}'

# Query existing cache
curl -X POST https://mnemo.solamp.workers.dev/tools/context_query \
  -H "Content-Type: application/json" \
  -d '{"alias":"nexus","query":"What is Nexus?","maxTokens":100}'
```

## Next Steps

1. **Fix Gemini API Key** on Mnemo worker (blocks all functionality)
2. **Set GITHUB_TOKEN** secret on ecosystem-agent
3. **Test end-to-end** with manual trigger
4. **Monitor first automatic run** at 3am EST (Dec 7, 2025)
5. **Review generated PR** for quality

## Developer Guide Improvements Needed

Based on this experience, the developer guides should clarify:

1. **MCP + Cloudflare Workers**: How to expose MCP tools via HTTP for Worker-to-Worker communication
2. **Gemini API Setup**: Required configuration, billing, permissions for context caching
3. **Local vs Remote MCP**: When to use stdio vs HTTP/SSE for MCP servers
4. **Cloudflare Worker Filesystem**: Explicit note that Workers can't access local paths - must use GitHub/HTTP
5. **MCP Tool Response Format**: Document the `{ content: [{ type: "text", text: "..." }] }` structure

## Deployment Info

**Worker URL**: https://ecosystem-agent.solamp.workers.dev
**Cron Schedule**: `0 8 * * *` (3am EST daily)
**Version**: 0.1.0
**Last Deploy**: 2025-12-06 (Version ID: 9e68813e-a13f-407a-b229-89bc1849588f)

## Related Documentation

- [README.md](./README.md) - Project overview and architecture
- [Mnemo CF Worker](https://github.com/CyberBrown/mnemo/tree/main/packages/cf-worker)
- [Cross-Team Q&A Board](/home/chris/nexus/docs/CROSS-TEAM-QA-BOARD.md)
