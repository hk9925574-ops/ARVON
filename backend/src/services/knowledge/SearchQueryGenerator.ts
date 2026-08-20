import { IAIProvider } from '../ai/AIProvider';

export class SearchQueryGenerator {
  private aiProvider: IAIProvider;

  constructor(aiProvider: IAIProvider) {
    this.aiProvider = aiProvider;
  }

  /**
   * Transforms a natural language user query into an optimized search engine query string.
   */
  public async generateQuery(userText: string, context: { date: string, type: 'GENERAL' | 'NEWS' | 'SPORTS' }): Promise<string> {
    const prompt = `
You are an expert Search Query Generator.
Current Date: ${context.date}
Search Type: ${context.type}

Transform the following user request into a highly optimized, short search engine query.
Rules:
1. Remove filler words (what, is, the, tell, me, about).
2. Append the current year or month if the question is time-sensitive (latest, current, today).
3. Do not include quotes unless necessary.
4. Output ONLY the query string, nothing else.

User Request: "${userText}"`;

    try {
      const result = await this.aiProvider.generateResponse([{ role: 'system', content: prompt }], { maxTokens: 30 });
      return result.replace(/['"]/g, '').trim() || userText;
    } catch (e) {
      console.error('[SearchQueryGenerator] AI generation failed, falling back to raw text');
      return userText;
    }
  }
}
