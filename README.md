# Ecosystem Agent

> **Autonomous agent system for Nexus, DE, and Mnemo teams**

Runs daily at 3am UTC to:
- Answer Q&A board questions
- Review answers and update documentation
- Check MCP developer guide updates
- Generate/update action plans
- Maintain README files
- Create GitHub PRs with changes

---

## Architecture

### Overview

```
┌─────────────────────────────────────────────────────┐
│  Cloudflare Worker (Cron: 3am UTC daily)            │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. Load team docs into Mnemo (shared cache)        │
│  2. For each team (Nexus, DE, Mnemo):               │
│     - Answer Q&A board questions                    │
│     - Review answers → update docs                  │
│     - Check MCP updates → apply to docs             │
│     - Update action plan                            │
│     - Review README                                 │
│  3. Create GitHub PR (one commit per team)          │
│  4. On failure: Create GitHub issue                 │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Components

- **MnemoClient** (`src/mnemo.ts`) - Loads docs into shared cache, queries for answers
- **GitHubClient** (`src/github.ts`) - Creates branches, commits, PRs, and issues
- **TeamAgent** (`src/agent.ts`) - Core logic for each team's agent
- **Main Worker** (`src/index.ts`) - Cron trigger handler, orchestration

---

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Secrets

```bash
# Required: GitHub personal access token (repo scope)
wrangler secret put GITHUB_TOKEN

# Optional: Slack webhook for cost alerts (not currently needed)
wrangler secret put SLACK_WEBHOOK_URL
```

**Note**: No `MNEMO_API_KEY` needed - we use Cloudflare Service Bindings for worker-to-worker communication.

### 3. Deploy

```bash
bun run deploy
```

---

## Development

### Run Locally

```bash
bun run dev
```

### Manual Trigger (for testing)

```bash
curl -X POST http://localhost:8787/trigger
```

Or in production:
```bash
curl -X POST https://ecosystem-agent.YOUR_SUBDOMAIN.workers.dev/trigger \
  -H "Authorization: Bearer YOUR_SECRET"
```

### Type Checking

```bash
bun run type-check
```

---

## How It Works

### Phase 1: Load Documentation

Agent loads all team documentation into a **shared Mnemo cache**:
- `/home/chris/nexus/docs/**`
- `/home/chris/nexus/ROADMAP.md`
- `/home/chris/nexus/CLAUDE.md`
- `/home/chris/mnemo/docs/**`
- `/home/chris/mnemo/ROADMAP.md`
- `/home/chris/mnemo/CLAUDE.md`
- `/home/chris/distributed-electrons/docs/**`
- `/home/chris/distributed-electrons/ROADMAP.md`
- `/home/chris/distributed-electrons/CLAUDE.md`

Cache TTL: 24 hours

### Phase 2: Process Each Team

For **Nexus**, **DE**, and **Mnemo**:

#### 2.1 Answer Q&A Board Questions

- Parse `/home/chris/nexus/docs/CROSS-TEAM-QA-BOARD.md`
- Find questions with:
  - `To: {team}`
  - `Status: 🟡 Open`
- Query Mnemo with question + context
- Update Q&A board with answer
- Mark status as `🟢 Answered`

#### 2.2 Review Answers

- Find questions with:
  - `From: {team}`
  - `Status: 🟢 Answered`
- Extract actionable insights from answers
- Create `docs/QA-INSIGHTS.md` with updates needed
- Track in `docsUpdated` for commit

#### 2.3 Check MCP Updates

- Query Mnemo for recent MCP developer guide changes
- Filter for relevance to team (Cloudflare patterns, architecture, security)
- Create `docs/MCP-UPDATES.md` with relevant changes
- Track in `docsUpdated` for commit

#### 2.4 Update Action Plan

- Review team's roadmap, Q&A status, recent answers
- Generate next session action plan (multiagent format)
- Use phases/steps (NOT timelines)
- Create/update `docs/ACTION-PLAN.md`
- Include blockers and dependencies

#### 2.5 Review README

- Check if README reflects:
  - Current project status
  - Recent features
  - Integration points
  - Setup instructions
- Mark for update if needed

### Phase 3: Commit Changes

For each team with changes:
1. Create branch: `autonomous-agent/YYYY-MM-DD`
2. Create commit with all updated files
3. Commit message includes:
   - Questions answered count
   - Answers reviewed count
   - Files updated
   - Action plan status

### Phase 4: Create Pull Request

- Combine all team commits into PR
- PR body includes summary for all teams
- PR title: `[Autonomous Agent] Daily updates - YYYY-MM-DD`
- **Review period**: 30 days (then graduate to direct commit)

### Phase 5: Error Handling

If agent fails for a team:
- Log errors
- Continue with next team (don't block)
- Create GitHub issue with:
  - Error messages
  - Partial results
  - Next steps
- Labels: `autonomous-agent`, `failure`

### Phase 6: Cost Tracking

- Track Mnemo API costs per team
- Alert if monthly cost > $50
- Send Slack notification (if configured)

---

## File Outputs

Each team's repo will have these files updated:

```
docs/
├── CROSS-TEAM-QA-BOARD.md      # Questions answered (shared)
├── QA-INSIGHTS.md               # Actionable insights from answers
├── MCP-UPDATES.md               # Relevant MCP guide updates
├── ACTION-PLAN.md               # Next session plan (multiagent format)
└── README.md                    # Kept up to date
```

---

## Cost Management

### Estimated Costs (per run)

| Operation | Cost | Notes |
|-----------|------|-------|
| Mnemo cache load | $0.10 | Once per day (shared) |
| Q&A answer (per question) | $0.02 | Gemini query |
| Answer review (per answer) | $0.02 | Gemini query |
| MCP update check | $0.03 | Gemini query |
| Action plan generation | $0.03 | Gemini query |
| README review | $0.02 | Gemini query |

**Total per team**: ~$0.12-$0.20 per day

**Monthly estimate**: $11-$18 for 3 teams (well below $50 threshold)

### Cost Alerts

If monthly cost exceeds $50:
- Console warning
- Slack notification (if configured)
- No automatic shutdown (continues running)

---

## Configuration

### Team Definitions

Edit `src/index.ts` to add/remove teams:

```typescript
const TEAMS: TeamConfig[] = [
  {
    name: 'nexus',
    displayName: 'Nexus',
    repoPath: '/home/chris/nexus',
    docsPath: '/home/chris/nexus/docs',
    qaAnswerMarker: '_Waiting for Nexus response_',
  },
  // Add more teams...
];
```

### Cron Schedule

Edit `wrangler.toml` to change schedule:

```toml
[triggers]
crons = ["0 3 * * *"]  # 3am UTC daily
```

Examples:
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 1` - Weekly on Mondays
- `*/30 * * * *` - Every 30 minutes

---

## Graduation to Direct Commit

**Phase 1 (First 30 days)**:
- All changes go through PR
- Human review required
- Iterate on agent quality

**Phase 2 (After 30 days of success)**:
- Agent commits directly to main
- No PR creation
- Failures still create issues

To enable direct commit:
1. Update `createPullRequest()` in `src/index.ts`
2. Change to direct commit instead of PR
3. Add commit verification

---

## Monitoring

### Check Agent Status

```bash
# View recent runs
wrangler tail

# Check last execution
curl https://ecosystem-agent.YOUR_SUBDOMAIN.workers.dev/health
```

### Review PRs

PRs created at: `https://github.com/CyberBrown/{team}/pulls`

### Check Issues

Issues created at: `https://github.com/CyberBrown/{team}/issues?q=label:autonomous-agent`

---

## Troubleshooting

### Agent Not Running

1. Check cron trigger is active:
   ```bash
   wrangler deployments list
   ```

2. Check secrets are set:
   ```bash
   wrangler secret list
   ```

3. View logs:
   ```bash
   wrangler tail
   ```

### Mnemo Cache Errors

- **Error 1042 (RESOURCE_EXHAUSTED)**: Gemini API key issue on Mnemo worker
  - Check `/home/chris/mnemo/packages/cf-worker` has valid `GEMINI_API_KEY` secret
  - Verify billing is enabled on Gemini API
  - Ensure context caching permissions are granted
- Verify cache alias: `ecosystem-agent-shared`
- Check Mnemo API status: https://mnemo.logosflux.io/health
- Test Mnemo directly:
  ```bash
  curl -X POST https://mnemo.logosflux.io/tools/context_list \
    -H "Content-Type: application/json" -d '{}'
  ```

### GitHub API Errors

- Check `GITHUB_TOKEN` has `repo` scope
- Verify rate limits: https://api.github.com/rate_limit
- Check branch/PR naming conflicts

### High Costs

- Review Mnemo usage: check cache TTL
- Reduce query frequency (change cron schedule)
- Optimize prompt lengths

---

## Security

### Secrets

Never commit:
- `GITHUB_TOKEN`
- `SLACK_WEBHOOK_URL`

All secrets stored in Cloudflare Workers Secrets.

### GitHub Token Permissions

Required scopes:
- `repo` (full repository access)
- `write:discussion` (optional, for discussions)

### Mnemo Integration

- Uses **Cloudflare Service Binding** for worker-to-worker communication
- No API keys needed - authentication is handled by the binding
- Shared cache contains all team documentation
- Cache TTL: 24 hours (auto-evicts)
- No PII stored in cache

---

## Future Enhancements

### Phase 1 (Current)
- ✅ Answer Q&A questions
- ✅ Review answers → update docs
- ✅ Check MCP updates
- ✅ Generate action plans
- ✅ Create PRs
- ✅ Error handling

### Phase 2 (Planned)
- [ ] Direct commit after 30-day graduation
- [ ] Multi-repo PR linking
- [ ] Automated doc linking (Q&A → roadmap)
- [ ] MCP guide proposal automation
- [ ] Slack integration for notifications

### Phase 3 (Future)
- [ ] Self-improving prompts based on feedback
- [ ] Cross-team dependency detection
- [ ] Automatic Q&A question generation
- [ ] Integration with project management tools

---

## Related Documentation

- [Cross-Team Q&A System](/home/chris/nexus/docs/CROSS-TEAM-QA-SYSTEM.md)
- [Cross-Team Q&A Board](/home/chris/nexus/docs/CROSS-TEAM-QA-BOARD.md)
- [Nexus Team Leader Summary](/home/chris/nexus/docs/TEAM-LEADER-SUMMARY.md)
- [Mnemo Team Leader Summary](/home/chris/mnemo/docs/TEAM-LEADER-SUMMARY.md)

---

## Contributing

This agent is part of the ecosystem automation. Changes should:
1. Be tested locally with `/trigger` endpoint
2. Not increase costs beyond $50/month
3. Follow multiagent planning patterns (no timelines)
4. Handle errors gracefully (continue with next team)

---

**Questions?** Add to [Q&A Board](/home/chris/nexus/docs/CROSS-TEAM-QA-BOARD.md):
```markdown
**From**: ecosystem-agent → **To**: chris
**Question**: [Your question about the autonomous agent]
```

---

🤖 **Generated**: 2025-12-06
**Version**: 0.2.0
**Status**: Ready for deployment (uses Service Binding for Mnemo)
**Last Updated**: 2025-12-09
**Deployed At**: https://ecosystem-agent.logosflux.io
**Cron Schedule**: 0 8 * * * (3am EST daily)

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for deployment history and known issues.
