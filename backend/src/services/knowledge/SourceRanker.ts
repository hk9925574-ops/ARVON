export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  publishedAt?: string;
  retrievedAt: number;
}

export class SourceRanker {
  private authorityDomains = ['.gov', '.edu', 'github.com', 'developer.mozilla.org', 'docs.microsoft.com', 'reuters.com', 'apnews.com', 'bbc.com', 'bloomberg.com', 'espn.com'];
  private lowQualityDomains = ['quora.com', 'reddit.com', 'yahoo.answers', 'pinterest.com'];

  /**
   * Ranks an array of search results based on domain authority, relevance, and recency heuristics.
   */
  public rank(results: SearchResult[]): SearchResult[] {
    const scoredResults = results.map(result => {
      let score = 50; // Base score
      
      const urlLower = result.url.toLowerCase();
      
      // Authority Boost
      if (this.authorityDomains.some(domain => urlLower.includes(domain))) {
        score += 30;
      }
      
      // Low Quality Penalty
      if (this.lowQualityDomains.some(domain => urlLower.includes(domain))) {
        score -= 20;
      }

      // Wikipedia is generally good for facts but not "breaking news"
      if (urlLower.includes('wikipedia.org')) {
        score += 15;
      }

      // Snippet Recency Check (very rough heuristic for dates in snippet like "Aug 17, 2026")
      const currentYear = new Date().getFullYear().toString();
      if (result.snippet.includes(currentYear)) {
        score += 10;
      }
      if (result.snippet.toLowerCase().includes('today') || result.snippet.toLowerCase().includes('hours ago') || result.snippet.toLowerCase().includes('mins ago')) {
        score += 15;
      }

      return { result, score };
    });

    // Sort by score descending
    scoredResults.sort((a, b) => b.score - a.score);

    // Basic date discrepancy detection to alert the LLM
    const yearsInSnippets = new Set<string>();
    scoredResults.forEach(sr => {
       const match = sr.result.snippet.match(/\b(202[0-9])\b/);
       if (match) yearsInSnippets.add(match[1]);
       if (sr.result.publishedAt) {
           const pubMatch = sr.result.publishedAt.match(/\b(202[0-9])\b/);
           if (pubMatch) yearsInSnippets.add(pubMatch[1]);
       }
    });
    
    if (yearsInSnippets.size > 1 && scoredResults.length > 0) {
       scoredResults[0].result.snippet = `[SYSTEM_WARNING: CONFLICTING TIMELINES DETECTED ACROSS SOURCES. YOU MUST EXPLICITLY MENTION THIS DISCREPANCY IN YOUR RESPONSE.]\n` + scoredResults[0].result.snippet;
    }

    return scoredResults.map(sr => sr.result);
  }
}
