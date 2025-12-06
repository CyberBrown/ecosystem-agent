import type { TeamConfig } from './types';

/**
 * Mnemo integration for context loading and querying
 */
export class MnemoClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.mnemo.dev') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Load team documentation into shared Mnemo cache
   */
  async loadTeamDocs(team: TeamConfig): Promise<void> {
    const alias = 'ecosystem-agent-shared';

    // Check if cache exists
    const caches = await this.listCaches();
    const existingCache = caches.find((c: any) => c.alias === alias);

    if (existingCache) {
      console.log(`Using existing shared cache: ${alias}`);
      return;
    }

    // Create new cache with all team docs
    const sources = [
      `/home/chris/nexus/docs`,
      `/home/chris/nexus/ROADMAP.md`,
      `/home/chris/nexus/CLAUDE.md`,
      `/home/chris/mnemo/docs`,
      `/home/chris/mnemo/ROADMAP.md`,
      `/home/chris/mnemo/CLAUDE.md`,
      `/home/chris/distributed-electrons/docs`,
      `/home/chris/distributed-electrons/ROADMAP.md`,
      `/home/chris/distributed-electrons/CLAUDE.md`,
    ];

    console.log(`Loading shared cache with ${sources.length} sources...`);

    const response = await fetch(`${this.baseUrl}/context/load`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        alias,
        sources,
        systemInstruction: 'You are helping autonomous agents answer cross-team questions and maintain documentation.',
        ttl: 86400, // 24 hours
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to load Mnemo cache: ${error}`);
    }

    console.log(`✅ Loaded shared cache: ${alias}`);
  }

  /**
   * Query Mnemo with a question
   */
  async query(question: string): Promise<string> {
    const alias = 'ecosystem-agent-shared';

    const response = await fetch(`${this.baseUrl}/context/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        alias,
        query: question,
        maxTokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to query Mnemo: ${error}`);
    }

    const data = (await response.json()) as any;
    return data.response || data.answer || '';
  }

  /**
   * List all active caches
   */
  async listCaches(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/context/list`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as any;
    return data.caches || [];
  }

  /**
   * Get cost statistics
   */
  async getStats(): Promise<{ totalCost: number; tokensUsed: number }> {
    const response = await fetch(`${this.baseUrl}/context/stats`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      return { totalCost: 0, tokensUsed: 0 };
    }

    const data = (await response.json()) as any;
    return {
      totalCost: data.totalCost || 0,
      tokensUsed: data.tokensUsed || 0,
    };
  }
}
