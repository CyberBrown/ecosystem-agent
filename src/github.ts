import type { GitHubFile, GitHubPR } from './types';

/**
 * GitHub API client for PR and issue management
 */
export class GitHubClient {
  private token: string;
  private baseUrl = 'https://api.github.com';

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Create a new branch from main
   */
  async createBranch(owner: string, repo: string, branchName: string): Promise<string> {
    // Get main branch SHA
    const mainRef = await this.fetch(`/repos/${owner}/${repo}/git/refs/heads/main`);
    const mainSha = mainRef.object.sha;

    // Create new branch
    await this.fetch(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: mainSha,
      }),
    });

    return mainSha;
  }

  /**
   * Create a commit with multiple file changes
   */
  async createCommit(
    owner: string,
    repo: string,
    branch: string,
    message: string,
    files: GitHubFile[]
  ): Promise<string> {
    // Get branch SHA
    const branchRef = await this.fetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`);
    const baseSha = branchRef.object.sha;

    // Get base tree
    const baseCommit = await this.fetch(`/repos/${owner}/${repo}/git/commits/${baseSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    // Create blobs for each file
    const tree = [];
    for (const file of files) {
      const blob = await this.fetch(`/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({
          content: file.content,
          encoding: 'utf-8',
        }),
      });

      tree.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      });
    }

    // Create new tree
    const newTree = await this.fetch(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree,
      }),
    });

    // Create commit
    const commit = await this.fetch(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: newTree.sha,
        parents: [baseSha],
      }),
    });

    // Update branch reference
    await this.fetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({
        sha: commit.sha,
      }),
    });

    return commit.sha;
  }

  /**
   * Create a pull request
   */
  async createPR(owner: string, repo: string, pr: GitHubPR): Promise<string> {
    const response = await this.fetch(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify(pr),
    });

    return response.html_url;
  }

  /**
   * Create an issue
   */
  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels: string[] = []
  ): Promise<string> {
    const response = await this.fetch(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
        labels,
      }),
    });

    return response.html_url;
  }

  /**
   * Get file contents from repo
   */
  async getFile(owner: string, repo: string, path: string, branch = 'main'): Promise<string> {
    try {
      const response = await this.fetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);

      if (response.content) {
        // GitHub returns base64 encoded content
        return atob(response.content.replace(/\n/g, ''));
      }

      return '';
    } catch (error) {
      console.error(`Failed to get file ${path}:`, error);
      return '';
    }
  }

  /**
   * Check if branch exists
   */
  async branchExists(owner: string, repo: string, branch: string): Promise<boolean> {
    try {
      await this.fetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper method for GitHub API calls
   */
  private async fetch(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...((options.headers as any) || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${error}`);
    }

    return response.json();
  }
}
