/**
 * Team configuration and metadata
 */
export interface TeamConfig {
  name: 'nexus' | 'de' | 'mnemo';
  displayName: string;
  repoPath: string;
  docsPath: string;
  qaAnswerMarker: string; // Text pattern to identify answered questions
}

/**
 * Q&A question from the board
 */
export interface QAQuestion {
  id: string;
  askedBy: string;
  askedTo: string;
  category: string;
  status: '🟡 Open' | '🟢 Answered' | '✅ Closed' | '🔴 Blocked';
  priority: '🔴' | '🟠' | '🟢' | '⚪';
  questionTitle: string;
  questionBody: string;
  context?: string;
  answerBody?: string;
  answeredBy?: string;
  answeredAt?: string;
}

/**
 * MCP developer guide update
 */
export interface MCPUpdate {
  guideId: string;
  section: string;
  changeType: 'new' | 'updated' | 'deprecated';
  summary: string;
  relevanceScore: number; // 0-1
}

/**
 * Action plan item (multiagent format)
 */
export interface ActionPlanItem {
  phase: string;
  description: string;
  dependencies: string[];
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  blockedBy?: string;
  notes?: string;
}

/**
 * Agent execution result
 */
export interface AgentResult {
  team: string;
  success: boolean;
  questionsAnswered: number;
  answersReviewed: number;
  docsUpdated: string[];
  mcpUpdatesProcessed: number;
  actionPlanUpdated: boolean;
  readmeUpdated: boolean;
  commitSha?: string;
  errors: string[];
  costEstimate: number; // USD
}

/**
 * Execution summary for all teams
 */
export interface ExecutionSummary {
  timestamp: string;
  results: AgentResult[];
  totalCost: number;
  prUrl?: string;
  issuesCreated: string[];
}

/**
 * Service binding interface for worker-to-worker calls
 */
export interface ServiceBinding {
  fetch(request: Request | string, init?: RequestInit): Promise<Response>;
}

/**
 * Environment bindings for Cloudflare Worker
 *
 * Note: No MNEMO_API_KEY needed - Mnemo handles Gemini auth internally.
 */
export interface Env {
  GITHUB_TOKEN?: string;
  RESEND_API_KEY?: string;
  MNEMO: ServiceBinding; // Service binding to Mnemo worker
  SLACK_WEBHOOK_URL?: string;
  ENVIRONMENT: string;
}

/**
 * GitHub API types
 */
export interface GitHubFile {
  path: string;
  content: string;
  sha?: string;
}

export interface GitHubCommit {
  message: string;
  tree: string;
  parents: string[];
}

export interface GitHubPR {
  title: string;
  body: string;
  head: string;
  base: string;
}
