import { IKnowledgeProvider, KnowledgeResult, KnowledgeSource } from '../KnowledgeEngine';
import { SearchQueryGenerator } from '../SearchQueryGenerator';
import { SourceRanker, SearchResult } from '../SourceRanker';

export class NewsKnowledgeProvider implements IKnowledgeProvider {
  name = 'Live News Knowledge';
  source = KnowledgeSource.WEB;
  
  private queryGenerator: SearchQueryGenerator;
  private sourceRanker: SourceRanker;
  
  // Cache: query -> { results, timestamp }
  private cache: Map<string, { results: KnowledgeResult[], timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for news

  constructor(queryGenerator: SearchQueryGenerator, sourceRanker: SourceRanker) {
    this.queryGenerator = queryGenerator;
    this.sourceRanker = sourceRanker;
  }
  
  async retrieve(text: string, context?: any): Promise<KnowledgeResult[]> {
    const optimizedQuery = await this.queryGenerator.generateQuery(text, { 
        date: context?.currentDate || new Date().toISOString(), 
        type: 'NEWS' 
    });

    if (this.cache.has(optimizedQuery)) {
        const cached = this.cache.get(optimizedQuery)!;
        if (Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
            return cached.results;
        }
    }

    try {
      const url = `https://lite.duckduckgo.com/lite/`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `q=${encodeURIComponent(optimizedQuery + ' news')}`
      });

      if (!response.ok) return [];
      const html = await response.text();

      // DuckDuckGo Lite parsing
      const rawResults: SearchResult[] = [];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let match;
      
      let currentTitle = '';
      let currentUrl = '';

      while ((match = rowRegex.exec(html)) !== null) {
          const rowContent = match[1];
          if (rowContent.includes('result-snippet')) {
              const snippetMatch = rowContent.match(/<td class='result-snippet'>([\s\S]*?)<\/td>/);
              if (snippetMatch && currentTitle) {
                  rawResults.push({
                      title: currentTitle,
                      url: currentUrl,
                      snippet: snippetMatch[1].replace(/<[^>]*>?/gm, '').trim(),
                      retrievedAt: Date.now()
                  });
              }
              currentTitle = '';
              currentUrl = '';
          } else if (rowContent.includes('result-url')) {
             // Contains title and url link
             const aTagMatch = rowContent.match(/<a class='result-url' href='([^']+)'>([\s\S]*?)<\/a>/);
             if (aTagMatch) {
                 currentUrl = aTagMatch[1];
                 currentTitle = aTagMatch[2].replace(/<[^>]*>?/gm, '').trim();
             }
          }
      }

      const ranked = this.sourceRanker.rank(rawResults);
      const topResults = ranked.slice(0, 4).map(r => ({
          source: KnowledgeSource.WEB,
          content: `[NEWS] ${r.title}\n${r.snippet}\nSource: ${r.url}`,
          confidence: 0.9,
          retrievedAt: r.retrievedAt
      }));

      this.cache.set(optimizedQuery, { results: topResults, timestamp: Date.now() });
      return topResults;
    } catch (e) {
      console.error('[ARVON][NewsKnowledge] Error:', e);
      return [];
    }
  }
}
