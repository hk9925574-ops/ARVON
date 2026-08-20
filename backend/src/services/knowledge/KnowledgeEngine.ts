export enum KnowledgeSource {
  BUILT_IN = 'BUILT_IN',
  MEMORY = 'MEMORY',
  DOCUMENTS = 'DOCUMENTS',
  PROJECT_FILES = 'PROJECT_FILES',
  WEB = 'WEB',
  SYSTEM = 'SYSTEM',
  TOOLS = 'TOOLS'
}

export interface KnowledgeResult {
  source: KnowledgeSource | string;
  content: string;
  confidence: number;
  retrievedAt: number;
}

export interface IKnowledgeProvider {
  name: string;
  source: KnowledgeSource;
  isAvailable?(): boolean; // Optional for backwards compatibility, if not needed remove it or ignore it
  retrieve(query: string, context?: any): Promise<KnowledgeResult[]>;
}

export class SystemKnowledgeProvider implements IKnowledgeProvider {
  name = 'System Knowledge';
  source = KnowledgeSource.SYSTEM;
  
  async retrieve(query: string, context?: any): Promise<KnowledgeResult[]> {
    return []; 
  }
}

import { SearchQueryGenerator } from './SearchQueryGenerator';
import { SourceRanker, SearchResult } from './SourceRanker';

export class WebKnowledgeProvider implements IKnowledgeProvider {
  name = 'Web Knowledge';
  source = KnowledgeSource.WEB;

  private queryGenerator: SearchQueryGenerator;
  private sourceRanker: SourceRanker;
  
  // Cache: query -> { results, timestamp }
  private cache: Map<string, { results: KnowledgeResult[], timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour for general web

  constructor(queryGenerator: SearchQueryGenerator, sourceRanker: SourceRanker) {
    this.queryGenerator = queryGenerator;
    this.sourceRanker = sourceRanker;
  }
  
  async retrieve(text: string, context?: any): Promise<KnowledgeResult[]> {
    const optimizedQuery = await this.queryGenerator.generateQuery(text, { 
        date: context?.currentDate || new Date().toISOString(), 
        type: 'GENERAL' 
    });

    if (this.cache.has(optimizedQuery)) {
        const cached = this.cache.get(optimizedQuery)!;
        if (Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
            return cached.results;
        }
    }

    try {
      // Use Wikipedia Search API instead of DuckDuckGo (which blocks with CAPTCHAs)
      const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(optimizedQuery)}&utf8=&format=json`;
      const response = await fetch(url);

      if (!response.ok) return [];
      const json = await response.json();

      if (!json.query || !json.query.search) return [];

      const topResults = json.query.search.slice(0, 3).map((r: any) => {
          // Remove the HTML highlight span tags that Wikipedia returns in the snippet
          const cleanSnippet = r.snippet.replace(/<[^>]*>?/gm, '').trim();
          return {
              source: KnowledgeSource.WEB,
              content: `[LIVE_WEB_SOURCE] ${r.title}\n${cleanSnippet}\nSource: https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}`,
              confidence: 0.9,
              retrievedAt: Date.now()
          };
      });

      this.cache.set(optimizedQuery, { results: topResults, timestamp: Date.now() });
      return topResults;
    } catch (e) {
      console.error('[ARVON][WebKnowledge] Error:', e);
      return [];
    }
  }
}

export class KnowledgeEngine {
  private providers: IKnowledgeProvider[] = [];

  constructor() {}

  public registerProvider(provider: IKnowledgeProvider) {
    this.providers.push(provider);
  }

  /**
   * Retrieves relevant knowledge based on the query.
   */
  public async retrieve(query: string, context?: any, activeProviders?: KnowledgeSource[]): Promise<KnowledgeResult[]> {
    const results: KnowledgeResult[] = [];
    
    // Determine which providers to query based on explicit route requirements
    const targetProviders = this.providers.filter(p => {
      if (activeProviders && !activeProviders.includes(p.source)) return false;
      return true;
    });

    // Execute retrievals in parallel
    const retrievalPromises = targetProviders.map(p => 
      p.retrieve(query, context).catch(err => {
        console.error(`[KnowledgeEngine] Provider ${p.name} failed:`, err);
        return [];
      })
    );

    const providerResults = await Promise.all(retrievalPromises);
    
    providerResults.forEach(res => {
      results.push(...res);
    });

    // Sort by confidence
    return results.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }
}
