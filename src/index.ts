import { Hono } from 'hono';
import type { Env, TeamConfig, ExecutionSummary, AgentResult } from './types';
import { MnemoClient } from './mnemo';
import { GitHubClient } from './github';
import { TeamAgent } from './agent';

const app = new Hono<{ Bindings: Env }>();

/**
 * Team configurations
 */
const TEAMS: TeamConfig[] = [
  {
    name: 'nexus',
    displayName: 'Nexus',
    repoPath: '/home/chris/nexus',
    docsPath: '/home/chris/nexus/docs',
    qaAnswerMarker: '_Waiting for Nexus response_',
  },
  {
    name: 'de',
    displayName: 'DE (Distributed Electrons)',
    repoPath: '/home/chris/distributed-electrons',
    docsPath: '/home/chris/distributed-electrons/docs',
    qaAnswerMarker: '_Waiting for DE response_',
  },
  {
    name: 'mnemo',
    displayName: 'Mnemo',
    repoPath: '/home/chris/mnemo',
    docsPath: '/home/chris/mnemo/docs',
    qaAnswerMarker: '_Waiting for Mnemo response_',
  },
];

/**
 * Main cron handler - runs at 3am daily
 */
async function handleScheduled(env: Env): Promise<ExecutionSummary> {
  const startTime = Date.now();
  console.log('🚀 Ecosystem Agent started at', new Date().toISOString());

  // Initialize clients
  // Note: MnemoClient doesn't need an API key - Mnemo handles Gemini auth internally
  const mnemo = new MnemoClient();
  const github = new GitHubClient(env.GITHUB_TOKEN);

  const results: AgentResult[] = [];
  const agents: TeamAgent[] = [];
  const issuesCreated: string[] = [];

  // Load shared Mnemo cache once for all teams
  try {
    console.log('📚 Loading shared documentation cache into Mnemo...');
    await mnemo.loadTeamDocs(TEAMS[0]); // Pass any team, cache is shared
  } catch (error) {
    console.error('Failed to load Mnemo cache:', error);
    // Continue anyway, agents will handle errors
  }

  // Process each team
  for (const team of TEAMS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing team: ${team.displayName}`);
    console.log('='.repeat(60));

    try {
      const agent = new TeamAgent(team, mnemo, github);
      const result = await agent.execute();
      results.push(result);
      agents.push(agent);

      // If agent failed, create GitHub issue
      if (!result.success && result.errors.length > 0) {
        const issueUrl = await createFailureIssue(github, team, result);
        issuesCreated.push(issueUrl);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Fatal error processing ${team.name}:`, errorMsg);

      results.push({
        team: team.name,
        success: false,
        questionsAnswered: 0,
        answersReviewed: 0,
        docsUpdated: [],
        mcpUpdatesProcessed: 0,
        actionPlanUpdated: false,
        readmeUpdated: false,
        errors: [errorMsg],
        costEstimate: 0,
      });
    }
  }

  // Create PR with all changes
  let prUrl: string | undefined;
  try {
    prUrl = await createPullRequest(github, results, agents);
  } catch (error) {
    console.error('Failed to create PR:', error);
  }

  // Check total cost
  const totalCost = results.reduce((sum, r) => sum + r.costEstimate, 0);
  if (totalCost > 50) {
    await sendCostAlert(env, totalCost);
  }

  // Get final Mnemo stats
  const mnemoStats = await mnemo.getStats();
  console.log(`\n💰 Mnemo costs: $${mnemoStats.totalCost.toFixed(4)}`);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✅ Ecosystem Agent completed in ${duration}s`);

  const summary: ExecutionSummary = {
    timestamp: new Date().toISOString(),
    results,
    totalCost,
    prUrl,
    issuesCreated,
  };

  return summary;
}

/**
 * Create GitHub issue for agent failure
 */
async function createFailureIssue(
  github: GitHubClient,
  team: TeamConfig,
  result: AgentResult
): Promise<string> {
  const title = `[Autonomous Agent] Failure for ${team.displayName} - ${new Date().toISOString().split('T')[0]}`;

  const body = `
## Agent Execution Failed

**Team**: ${team.displayName}
**Timestamp**: ${new Date().toISOString()}

### Errors

${result.errors.map((e) => `- ${e}`).join('\n')}

### Partial Results

- Questions Answered: ${result.questionsAnswered}
- Answers Reviewed: ${result.answersReviewed}
- Docs Updated: ${result.docsUpdated.join(', ') || 'None'}
- MCP Updates Processed: ${result.mcpUpdatesProcessed}
- Action Plan Updated: ${result.actionPlanUpdated ? 'Yes' : 'No'}
- README Updated: ${result.readmeUpdated ? 'Yes' : 'No'}

### Next Steps

1. Review error messages above
2. Check if any manual intervention is needed
3. Fix underlying issues
4. Agent will retry on next scheduled run

---
*This issue was automatically created by the Ecosystem Agent*
`;

  try {
    const url = await github.createIssue('CyberBrown', team.name, title, body, [
      'autonomous-agent',
      'failure',
    ]);
    console.log(`📝 Created failure issue: ${url}`);
    return url;
  } catch (error) {
    console.error('Failed to create GitHub issue:', error);
    return 'Failed to create issue';
  }
}

/**
 * Create pull request with all team changes
 */
async function createPullRequest(
  github: GitHubClient,
  results: AgentResult[],
  agents: TeamAgent[]
): Promise<string | undefined> {
  const branchName = `autonomous-agent/${new Date().toISOString().split('T')[0]}`;
  const successfulTeams = results.filter((r) => r.success && r.docsUpdated.length > 0);

  if (successfulTeams.length === 0) {
    console.log('⏭️  No changes to commit, skipping PR');
    return undefined;
  }

  console.log(`\n📦 Creating PR with ${successfulTeams.length} team commits...`);

  // For each team with changes, create a commit
  for (const result of successfulTeams) {
    const team = TEAMS.find((t) => t.name === result.team);
    if (!team) continue;

    const agent = agents.find((a) => a['team'].name === result.team);
    if (!agent) continue;

    try {
      // Check if branch exists, create if not
      const branchExists = await github.branchExists('CyberBrown', team.name, branchName);
      if (!branchExists) {
        await github.createBranch('CyberBrown', team.name, branchName);
      }

      // Create commit message
      const commitMessage = `[Autonomous Agent] ${team.displayName} updates

- Questions answered: ${result.questionsAnswered}
- Answers reviewed: ${result.answersReviewed}
- Docs updated: ${result.docsUpdated.join(', ')}
- MCP updates processed: ${result.mcpUpdatesProcessed}
- Action plan updated: ${result.actionPlanUpdated}
- README updated: ${result.readmeUpdated}

🤖 Generated with Autonomous Agent
Generated at: ${new Date().toISOString()}
`;

      // Get changed files from agent
      const files = agent.getFileChanges();

      const commitSha = await github.createCommit(
        'CyberBrown',
        team.name,
        branchName,
        commitMessage,
        files
      );

      console.log(`✅ Created commit for ${team.displayName}: ${commitSha.substring(0, 7)}`);
    } catch (error) {
      console.error(`Failed to commit for ${team.name}:`, error);
    }
  }

  // Create PR for first team (others will be separate PRs in their repos)
  const firstTeam = TEAMS.find((t) => t.name === successfulTeams[0].team);
  if (!firstTeam) return undefined;

  try {
    const prBody = `
## Autonomous Agent Updates

This PR contains automated updates from the Ecosystem Agent's daily run.

${successfulTeams
  .map(
    (r) => `
### ${TEAMS.find((t) => t.name === r.team)?.displayName}

- ✅ Questions answered: ${r.questionsAnswered}
- 📖 Answers reviewed: ${r.answersReviewed}
- 📝 Docs updated: ${r.docsUpdated.length} files
- 🔍 MCP updates processed: ${r.mcpUpdatesProcessed}
- 📋 Action plan: ${r.actionPlanUpdated ? 'Updated' : 'No changes'}
- 📄 README: ${r.readmeUpdated ? 'Updated' : 'No changes'}
`
  )
  .join('\n')}

### Cost Summary

Total estimated cost: $${results.reduce((sum, r) => sum + r.costEstimate, 0).toFixed(4)}

---

**Review Process**: This PR will remain open for 30 days for human review. After 30 days of successful runs, the agent will begin committing directly to main.

**Questions?** Check the [Cross-Team Q&A Board](/home/chris/nexus/docs/CROSS-TEAM-QA-BOARD.md)

---
🤖 Generated by [Ecosystem Agent](https://github.com/CyberBrown/ecosystem-agent)
Generated at: ${new Date().toISOString()}
`;

    const prUrl = await github.createPR('CyberBrown', firstTeam.name, {
      title: `[Autonomous Agent] Daily updates - ${new Date().toISOString().split('T')[0]}`,
      body: prBody,
      head: branchName,
      base: 'main',
    });

    console.log(`✅ Created PR: ${prUrl}`);
    return prUrl;
  } catch (error) {
    console.error('Failed to create PR:', error);
    return undefined;
  }
}

/**
 * Send cost alert if threshold exceeded
 */
async function sendCostAlert(env: Env, totalCost: number): Promise<void> {
  console.warn(`⚠️  Cost threshold exceeded: $${totalCost.toFixed(2)} > $50.00`);

  if (env.SLACK_WEBHOOK_URL) {
    try {
      await fetch(env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 Ecosystem Agent Cost Alert: $${totalCost.toFixed(2)} (threshold: $50.00)`,
        }),
      });
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }
}

// Routes
app.get('/', (c) => {
  return c.text('Ecosystem Agent - Autonomous team agent system');
});

app.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Manual trigger for testing
app.post('/trigger', async (c) => {
  const env = c.env;
  const summary = await handleScheduled(env);
  return c.json(summary);
});

// Export default handler
export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(env));
  },
};
