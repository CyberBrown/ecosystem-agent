# Ecosystem Agent Deployment Guide

> **Complete guide to deploying the autonomous agent system**

---

## Prerequisites

1. **Cloudflare Account** with Workers enabled
2. **GitHub Personal Access Token** with `repo` scope
3. **Mnemo API Key** (contact Mnemo team)
4. **Bun** installed (v1.0+)
5. **Wrangler CLI** installed globally

---

## Step 1: Verify Installation

```bash
cd /home/chris/ecosystem-agent

# Check dependencies
/home/chris/.bun/bin/bun --version
/home/chris/.bun/bin/bun run type-check
```

---

## Step 2: Configure Secrets

### 2.1 GitHub Token

Create a personal access token at: https://github.com/settings/tokens

Required scopes:
- ✅ `repo` (full repository access)

Set the secret:
```bash
npx wrangler secret put GITHUB_TOKEN
# Paste your token when prompted
```

### 2.2 Mnemo API Key

Contact Mnemo team for API key.

Set the secret:
```bash
npx wrangler secret put MNEMO_API_KEY
# Paste your key when prompted
```

### 2.3 Slack Webhook (Optional)

For cost alerts and failure notifications:
```bash
npx wrangler secret put SLACK_WEBHOOK_URL
# Paste your Slack webhook URL when prompted
```

---

## Step 3: Verify Configuration

```bash
# List secrets (values are hidden)
npx wrangler secret list

# Should show:
# GITHUB_TOKEN
# MNEMO_API_KEY
# SLACK_WEBHOOK_URL (optional)
```

---

## Step 4: Deploy to Cloudflare

```bash
# Deploy the worker
/home/chris/.bun/bin/bun run deploy

# Output should show:
# ✅ Worker deployed successfully
# 📍 URL: https://ecosystem-agent.YOUR_SUBDOMAIN.workers.dev
```

---

## Step 5: Verify Deployment

```bash
# Check health endpoint
curl https://ecosystem-agent.YOUR_SUBDOMAIN.workers.dev/health

# Should return:
# {"status":"healthy","timestamp":"2025-12-05T..."}
```

---

## Step 6: Test Manual Trigger

```bash
# Trigger a test run (bypasses cron schedule)
curl -X POST https://ecosystem-agent.YOUR_SUBDOMAIN.workers.dev/trigger

# This will:
# - Load docs into Mnemo
# - Process all teams
# - Create PR with changes
# - Return execution summary
```

---

## Step 7: Verify Cron Schedule

```bash
# Check cron triggers
npx wrangler deployments list

# Should show cron: "0 3 * * *" (3am UTC daily)
```

---

## Step 8: Monitor First Run

The agent will run automatically at 3am UTC. To monitor:

```bash
# View real-time logs
npx wrangler tail

# Or check execution history
npx wrangler deployments list
```

---

## Expected Output

After first run, you should see:

### 1. GitHub Pull Request

Location: `https://github.com/CyberBrown/nexus/pulls`

PR will include:
- One commit per team (Nexus, DE, Mnemo)
- Summary of questions answered
- Summary of answers reviewed
- List of docs updated

### 2. Updated Files (per team)

```
docs/
├── CROSS-TEAM-QA-BOARD.md   # Questions answered
├── QA-INSIGHTS.md            # New insights from answers
├── MCP-UPDATES.md            # Relevant MCP updates
└── ACTION-PLAN.md            # Next session plan
```

### 3. Mnemo Cache

- Alias: `ecosystem-agent-shared`
- TTL: 24 hours
- Contains all team docs

---

## Troubleshooting

### Issue: "GITHUB_TOKEN not found"

```bash
# Verify secret is set
npx wrangler secret list

# If missing, set it
npx wrangler secret put GITHUB_TOKEN
```

### Issue: "Failed to load Mnemo cache"

Check:
1. MNEMO_API_KEY is valid
2. Mnemo API is accessible
3. Check Mnemo service status

### Issue: "Failed to create branch"

Possible causes:
- GitHub token lacks `repo` scope
- Branch already exists from previous run
- Repository doesn't exist

Solution:
```bash
# Delete existing branch manually
gh repo clone CyberBrown/nexus
cd nexus
git branch -D autonomous-agent/2025-12-05
git push origin --delete autonomous-agent/2025-12-05
```

### Issue: "High costs warning"

If Mnemo costs exceed $50/month:
1. Review cache TTL (currently 24 hours)
2. Consider reducing cron frequency
3. Optimize prompt lengths in agent.ts

---

## Monitoring

### Real-time Logs

```bash
npx wrangler tail
```

### Execution History

```bash
# View recent deployments
npx wrangler deployments list

# View recent invocations
npx wrangler analytics
```

### GitHub Issues

Failed runs create issues at:
```
https://github.com/CyberBrown/{team}/issues?q=label:autonomous-agent
```

---

## Updating the Agent

### Code Changes

```bash
# 1. Make changes to src/
# 2. Type check
/home/chris/.bun/bin/bun run type-check

# 3. Deploy
/home/chris/.bun/bin/bun run deploy
```

### Configuration Changes

Edit `wrangler.toml`:
- Change cron schedule
- Add environment variables
- Update worker name

Then redeploy:
```bash
/home/chris/.bun/bin/bun run deploy
```

---

## Cost Tracking

### Estimated Costs

**Cloudflare Workers**:
- Free tier: 100,000 requests/day
- Agent runs once daily = 30 requests/month
- **Cost**: $0 (well within free tier)

**Mnemo API**:
- Cache load: $0.10/day
- Q&A answers: ~$0.02/question
- Estimated: $3-5/month per team
- **Total**: $11-$18/month for 3 teams

**Total estimated**: ~$15/month (well below $50 threshold)

### Cost Alert Threshold

Alert triggers at $50/month (3x expected cost).

To change threshold, edit `src/index.ts`:
```typescript
if (totalCost > 50) {  // Change to desired threshold
  await sendCostAlert(env, totalCost);
}
```

---

## Security

### Secrets Management

- Never commit secrets to git
- Secrets stored in Cloudflare Workers Secrets
- Rotate tokens every 90 days

### GitHub Token Security

Minimum required scopes:
- `repo` - Full repository access

Do NOT grant:
- `admin:org` - Not needed
- `delete_repo` - Not needed
- `admin:public_key` - Not needed

### Mnemo API Security

- API key is project-specific
- Cache is isolated per alias
- No PII stored in cache (documentation only)

---

## Rollback

If deployment fails:

```bash
# View deployment history
npx wrangler deployments list

# Rollback to previous version
npx wrangler rollback <DEPLOYMENT_ID>
```

---

## Uninstalling

To completely remove the agent:

```bash
# 1. Delete secrets
npx wrangler secret delete GITHUB_TOKEN
npx wrangler secret delete MNEMO_API_KEY
npx wrangler secret delete SLACK_WEBHOOK_URL

# 2. Delete worker
npx wrangler delete ecosystem-agent

# 3. Delete local files
cd /home/chris
rm -rf ecosystem-agent
```

---

## Support

### Questions?

Add to Q&A board:
```markdown
**From**: ecosystem-agent → **To**: chris
**Question**: [Your deployment question]
```

### Bugs?

Create GitHub issue:
```bash
gh issue create --repo CyberBrown/ecosystem-agent \
  --title "Deployment issue: ..." \
  --body "Description of issue..."
```

---

## Next Steps After Deployment

1. ✅ Monitor first 3 runs (review PRs)
2. ✅ Check Q&A board updates
3. ✅ Verify cost is within expected range
4. ✅ Review action plans generated
5. ✅ After 30 days: Consider graduation to direct commit

---

**Deployed**: [Date]
**Version**: 0.1.0
**Status**: Production Ready
