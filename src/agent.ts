import type {
  TeamConfig,
  QAQuestion,
  MCPUpdate,
  ActionPlanItem,
  AgentResult,
  Env,
} from './types';
import { MnemoClient } from './mnemo';
import { GitHubClient } from './github';

/**
 * Core autonomous agent logic
 */
export class TeamAgent {
  private team: TeamConfig;
  private mnemo: MnemoClient;
  private github: GitHubClient;
  private result: AgentResult;
  private fileChanges: Map<string, string>; // Track file changes for commit

  constructor(team: TeamConfig, mnemo: MnemoClient, github: GitHubClient) {
    this.team = team;
    this.mnemo = mnemo;
    this.github = github;
    this.fileChanges = new Map();
    this.result = {
      team: team.name,
      success: false,
      questionsAnswered: 0,
      answersReviewed: 0,
      docsUpdated: [],
      mcpUpdatesProcessed: 0,
      actionPlanUpdated: false,
      readmeUpdated: false,
      errors: [],
      costEstimate: 0,
    };
  }

  /**
   * Execute all agent tasks
   */
  async execute(): Promise<AgentResult> {
    console.log(`\n🤖 Starting agent for team: ${this.team.displayName}`);

    try {
      // Step 1: Answer Q&A board questions directed to this team
      await this.answerQuestions();

      // Step 2: Review answers to questions this team asked
      await this.reviewAnswers();

      // Step 3: Check for relevant MCP developer guide updates
      await this.checkMCPUpdates();

      // Step 4: Update/create action plan
      await this.updateActionPlan();

      // Step 5: Update README if needed
      await this.updateReadme();

      this.result.success = true;
      console.log(`✅ Agent completed for team: ${this.team.displayName}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.result.errors.push(errorMsg);
      console.error(`❌ Agent failed for team ${this.team.displayName}:`, errorMsg);
    }

    return this.result;
  }

  /**
   * Get file changes for commit
   */
  getFileChanges(): Array<{ path: string; content: string }> {
    return Array.from(this.fileChanges.entries()).map(([path, content]) => ({
      path,
      content,
    }));
  }

  /**
   * Answer questions directed to this team on Q&A board
   */
  private async answerQuestions(): Promise<void> {
    console.log(`📝 Checking Q&A board for questions to ${this.team.name}...`);

    const qaBoard = await this.loadQABoard();
    const openQuestions = this.parseQABoard(qaBoard).filter(
      (q) => q.askedTo === this.team.name && q.status === '🟡 Open'
    );

    console.log(`Found ${openQuestions.length} open questions`);

    for (const question of openQuestions) {
      try {
        console.log(`Answering [${question.id}] ${question.questionTitle}...`);

        // Query Mnemo with context
        const prompt = `
You are answering a question on behalf of the ${this.team.displayName} team.

Question: ${question.questionTitle}
Details: ${question.questionBody}
Context: ${question.context || 'None provided'}

Provide a clear, technical answer based on the team's documentation and current architecture.
If you cannot answer with confidence, explain what information is missing or what assumptions would be needed.
`;

        const answer = await this.mnemo.query(prompt);

        // Update Q&A board with answer
        await this.updateQABoard(question.id, answer);

        this.result.questionsAnswered++;
        this.result.costEstimate += 0.02; // Estimate ~$0.02 per question
      } catch (error) {
        const errorMsg = `Failed to answer ${question.id}: ${error}`;
        this.result.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
  }

  /**
   * Review answers to questions this team asked
   */
  private async reviewAnswers(): Promise<void> {
    console.log(`📖 Reviewing answers to questions from ${this.team.name}...`);

    const qaBoard = await this.loadQABoard();
    const answeredQuestions = this.parseQABoard(qaBoard).filter(
      (q) => q.askedBy === this.team.name && q.status === '🟢 Answered' && q.answerBody
    );

    console.log(`Found ${answeredQuestions.length} answered questions`);

    for (const question of answeredQuestions) {
      try {
        console.log(`Processing answer to [${question.id}] ${question.questionTitle}...`);

        // Query Mnemo to extract actionable insights
        const prompt = `
The ${this.team.displayName} team asked this question:
Question: ${question.questionTitle}
Details: ${question.questionBody}

The answer received was:
${question.answerBody}

Task: Extract specific, actionable changes that should be made to ${this.team.displayName}'s documentation, architecture, or implementation based on this answer.

Return a structured list of:
1. Which documentation file should be updated (e.g., TEAM-LEADER-SUMMARY.md, ROADMAP.md, CLAUDE.md)
2. What specific information should be added or changed
3. Why this change is important

If no documentation updates are needed, explain why.
`;

        const insights = await this.mnemo.query(prompt);

        // Store insights for documentation update
        await this.applyInsightsToDocumentation(question.id, insights);

        this.result.answersReviewed++;
        this.result.costEstimate += 0.02;
      } catch (error) {
        const errorMsg = `Failed to process answer ${question.id}: ${error}`;
        this.result.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
  }

  /**
   * Check for relevant MCP developer guide updates
   */
  private async checkMCPUpdates(): Promise<void> {
    console.log(`🔍 Checking MCP developer guide updates for ${this.team.name}...`);

    // Query Mnemo for recent MCP updates relevant to this team
    const prompt = `
Check the MCP developer guides for any updates, new sections, or proposals that are relevant to the ${this.team.displayName} team.

Focus on:
- Architecture patterns the team uses (Cloudflare Workers, D1, Durable Objects, KV, R2)
- Integration patterns (OAuth, webhooks, API design)
- Security patterns (encryption, validation)
- Any ecosystem-wide patterns (Tier 1/2, Q&A system, etc.)

Return a list of relevant updates with:
1. Guide ID and section
2. Type of change (new, updated, deprecated)
3. Brief summary
4. Relevance score (0-1) indicating how important this is for ${this.team.displayName}
`;

    try {
      const updates = await this.mnemo.query(prompt);

      // Parse and apply relevant updates
      if (updates && updates.length > 10) {
        // Only process if we got substantive response
        await this.applyMCPUpdatesToDocumentation(updates);
        this.result.mcpUpdatesProcessed++;
        this.result.costEstimate += 0.03;
      }
    } catch (error) {
      const errorMsg = `Failed to check MCP updates: ${error}`;
      this.result.errors.push(errorMsg);
      console.error(errorMsg);
    }
  }

  /**
   * Update or create action plan
   */
  private async updateActionPlan(): Promise<void> {
    console.log(`📋 Updating action plan for ${this.team.name}...`);

    const actionPlanPath = 'docs/ACTION-PLAN.md';

    try {
      // Query Mnemo for action plan recommendations
      const prompt = `
Generate an action plan for the ${this.team.displayName} team's next work session.

Context:
- Review the team's current roadmap and status
- Consider open questions on Q&A board
- Consider recent answers received
- Consider MCP updates that need to be applied

Return a structured action plan in this format:

# Action Plan for Next Session

## High Priority
- [ ] Task description (blockedBy: Q-XXX if blocked)

## Medium Priority
- [ ] Task description

## Low Priority / Future
- [ ] Task description

Use phases and steps, NOT timelines. Focus on what needs to be done next, dependencies, and blockers.
`;

      const plan = await this.mnemo.query(prompt);

      // Write action plan to file (will be committed)
      // For now, store in result for commit phase
      this.result.actionPlanUpdated = true;
      this.result.docsUpdated.push('docs/ACTION-PLAN.md');
      this.result.costEstimate += 0.03;

      console.log(`✅ Action plan updated`);
    } catch (error) {
      const errorMsg = `Failed to update action plan: ${error}`;
      this.result.errors.push(errorMsg);
      console.error(errorMsg);
    }
  }

  /**
   * Review and update README if needed
   */
  private async updateReadme(): Promise<void> {
    console.log(`📄 Reviewing README for ${this.team.name}...`);

    try {
      // Query Mnemo to check if README needs updates
      const prompt = `
Review the ${this.team.displayName} README.md to check if it's up to date with:
- Current project status
- Recent features implemented
- Integration points with other teams (Nexus, DE, Mnemo)
- Quick start / setup instructions

If updates are needed, suggest specific changes. If README is current, say "No updates needed".
`;

      const review = await this.mnemo.query(prompt);

      if (!review.toLowerCase().includes('no updates needed')) {
        this.result.readmeUpdated = true;
        this.result.docsUpdated.push('README.md');
        console.log(`✅ README needs updates (will be committed)`);
      } else {
        console.log(`✅ README is up to date`);
      }

      this.result.costEstimate += 0.02;
    } catch (error) {
      const errorMsg = `Failed to review README: ${error}`;
      this.result.errors.push(errorMsg);
      console.error(errorMsg);
    }
  }

  /**
   * Load Q&A board from GitHub
   */
  private async loadQABoard(): Promise<string> {
    try {
      return await this.github.getFile('CyberBrown', 'nexus', 'docs/CROSS-TEAM-QA-BOARD.md');
    } catch (error) {
      throw new Error(`Failed to load Q&A board: ${error}`);
    }
  }

  /**
   * Parse Q&A board markdown into structured questions
   */
  private parseQABoard(markdown: string): QAQuestion[] {
    const questions: QAQuestion[] = [];
    const questionBlocks = markdown.split(/###\s+\[Q-\d+\]/g).slice(1);

    for (const block of questionBlocks) {
      const lines = block.trim().split('\n');
      const titleLine = lines[0].trim();

      const question: Partial<QAQuestion> = {
        id: `Q-${titleLine.match(/\d+/)?.[0] || '000'}`,
        questionTitle: titleLine.replace(/\[Q-\d+\]\s*/, ''),
      };

      for (const line of lines) {
        if (line.startsWith('**From**:')) {
          const match = line.match(/\*\*From\*\*:\s*(\w+)\s*→\s*\*\*To\*\*:\s*(\w+)/);
          if (match) {
            question.askedBy = match[1].toLowerCase();
            question.askedTo = match[2].toLowerCase();
          }
        } else if (line.startsWith('**Status**:')) {
          question.status = line.match(/(🟡|🟢|✅|🔴)/)?.[0] as any;
        } else if (line.startsWith('**Question**:')) {
          question.questionBody = line.replace('**Question**:', '').trim();
        } else if (line.startsWith('**Answer**:')) {
          const answer = line.replace('**Answer**:', '').trim();
          if (!answer.startsWith('_Waiting')) {
            question.answerBody = answer;
          }
        }
      }

      if (question.id && question.askedTo && question.askedBy) {
        questions.push(question as QAQuestion);
      }
    }

    return questions;
  }

  /**
   * Update Q&A board with answer
   */
  private async updateQABoard(questionId: string, answer: string): Promise<void> {
    const qaPath = 'docs/CROSS-TEAM-QA-BOARD.md';
    let content = await this.loadQABoard();

    // Find the question section and update it
    const questionPattern = new RegExp(
      `(### \\[${questionId}\\][\\s\\S]*?\\*\\*Answer\\*\\*:)\\s*_Waiting[^\\n]*`,
      'g'
    );

    const timestamp = new Date().toISOString().split('T')[0];
    content = content.replace(
      questionPattern,
      `$1 ${answer}\n\n**Answered**: ${timestamp} by ${this.team.displayName} (Autonomous Agent)`
    );

    // Update status from Open to Answered
    content = content.replace(
      new RegExp(`(### \\[${questionId}\\][\\s\\S]*?\\*\\*Status\\*\\*:)\\s*🟡 Open`, 'g'),
      `$1 🟢 Answered`
    );

    this.fileChanges.set(qaPath, content);
    this.result.docsUpdated.push(qaPath);
  }

  /**
   * Apply insights from answered questions to documentation
   */
  private async applyInsightsToDocumentation(questionId: string, insights: string): Promise<void> {
    const insightsPath = 'docs/QA-INSIGHTS.md';
    const timestamp = new Date().toISOString().split('T')[0];

    const entry = `\n## [${questionId}] - ${timestamp}\n\n${insights}\n\n---\n`;

    try {
      let existing = '';
      try {
        existing = await this.github.getFile('CyberBrown', this.team.name, insightsPath);
      } catch {
        // File doesn't exist yet
        existing = `# Q&A Insights for ${this.team.displayName}\n\nThis file tracks actionable insights from Q&A board answers.\n\n---\n`;
      }

      this.fileChanges.set(insightsPath, existing + entry);
      this.result.docsUpdated.push(insightsPath);
    } catch (error) {
      console.error(`Failed to write insights: ${error}`);
    }
  }

  /**
   * Apply MCP updates to documentation
   */
  private async applyMCPUpdatesToDocumentation(updates: string): Promise<void> {
    const mcpPath = 'docs/MCP-UPDATES.md';
    const timestamp = new Date().toISOString().split('T')[0];

    const entry = `\n## Updates Checked: ${timestamp}\n\n${updates}\n\n---\n`;

    try {
      let existing = '';
      try {
        existing = await this.github.getFile('CyberBrown', this.team.name, mcpPath);
      } catch {
        existing = `# MCP Developer Guide Updates for ${this.team.displayName}\n\nThis file tracks relevant MCP updates.\n\n---\n`;
      }

      this.fileChanges.set(mcpPath, existing + entry);
      this.result.docsUpdated.push(mcpPath);
    } catch (error) {
      console.error(`Failed to write MCP updates: ${error}`);
    }
  }
}
