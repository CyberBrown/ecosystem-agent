import type { TeamConfig, ServiceBinding } from './types';

/**
 * Mnemo integration for context loading and querying
 *
 * Uses Cloudflare Service Binding for worker-to-worker communication.
 * No API key needed - authentication is handled by the binding.
 */
export class MnemoClient {
  private binding: ServiceBinding;

  constructor(binding: ServiceBinding) {
    this.binding = binding;
  }

  /**
   * Make a request to Mnemo via service binding
   */
  private async request(tool: string, params: Record<string, unknown>): Promise<Response> {
    return this.binding.fetch(`https://mnemo/tools/${tool}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
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

    // Create new cache with all team docs from GitHub
    const sources = [
      'https://github.com/CyberBrown/nexus',
      'https://github.com/CyberBrown/mnemo',
      'https://github.com/CyberBrown/distributed-electrons',
    ];

    console.log(`Loading shared cache with ${sources.length} sources...`);

    const response = await this.request('context_load', {
      alias,
      sources,
      systemInstruction: 'You are helping autonomous agents answer cross-team questions and maintain documentation.',
      ttl: 86400, // 24 hours
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

    const response = await this.request('context_query', {
      alias,
      query: question,
      maxTokens: 2000,
      temperature: 0.3,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to query Mnemo: ${error}`);
    }

    const data = (await response.json()) as any;
    // MCP tool returns: { content: [{ type: "text", text: "..." }] }
    if (data.content && Array.isArray(data.content) && data.content.length > 0) {
      return data.content[0].text || '';
    }
    return data.response || data.answer || data.text || '';
  }

  /**
   * List all active caches
   */
  async listCaches(): Promise<any[]> {
    const response = await this.request('context_list', {});

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as any;
    // MCP tool returns: { content: [{ type: "text", text: "[{...}]" }] }
    if (data.content && Array.isArray(data.content) && data.content.length > 0) {
      try {
        const parsed = JSON.parse(data.content[0].text);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return data.caches || [];
  }

  /**
   * Get cost statistics
   */
  async getStats(): Promise<{ totalCost: number; tokensUsed: number }> {
    const response = await this.request('context_stats', {});

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
