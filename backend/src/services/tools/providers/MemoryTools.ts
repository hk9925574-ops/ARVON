import { ITool, ToolConfig } from '../ToolRegistry';
import { VectorDatabase } from '../../memory/VectorDatabase';
import { GeminiAIProvider } from '../../ai/GeminiAIProvider';

export class SaveMemoryTool implements ITool {
  name = 'SaveMemoryTool';
  description = 'Saves a piece of knowledge to your long-term vector memory database for later retrieval.';
  permissionTier: 1 | 2 | 3 = 1;

  inputSchema = {
    type: 'object',
    properties: {
        text: { type: 'string', description: 'The text to remember.' },
        category: { type: 'string', description: 'Category of the memory (e.g., user_fact, project_detail).' }
    },
    required: ['text']
  };

  constructor(private vectorDb: VectorDatabase, private aiProvider: GeminiAIProvider) {}

  async execute(args: any, config: ToolConfig): Promise<any> {
    const vector = await this.aiProvider.generateEmbeddings(args.text);
    if (!vector || vector.length === 0) {
        return { success: false, error: 'Failed to generate embeddings' };
    }
    
    const id = this.vectorDb.insert({
        text: args.text,
        vector: vector,
        metadata: { category: args.category || 'general' }
    });
    
    return { success: true, message: `Memory saved with ID ${id}` };
  }
}

export class SearchMemoryTool implements ITool {
  name = 'SearchMemoryTool';
  description = 'Searches your long-term vector memory database for relevant knowledge.';
  permissionTier: 1 | 2 | 3 = 1;

  inputSchema = {
    type: 'object',
    properties: {
        query: { type: 'string', description: 'The search query.' },
        limit: { type: 'number', description: 'Max number of results to return (default 3).' }
    },
    required: ['query']
  };

  constructor(private vectorDb: VectorDatabase, private aiProvider: GeminiAIProvider) {}

  async execute(args: any, config: ToolConfig): Promise<any> {
    const vector = await this.aiProvider.generateEmbeddings(args.query);
    if (!vector || vector.length === 0) {
        return { success: false, error: 'Failed to generate embeddings for query' };
    }
    
    const results = this.vectorDb.search(vector, args.limit || 3);
    
    return { 
        success: true, 
        results: results.map(r => ({ text: r.text, category: r.metadata?.category })) 
    };
  }
}
