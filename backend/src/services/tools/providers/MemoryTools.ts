import { ITool, ToolConfig } from '../ToolRegistry';
import { VectorDatabase } from '../../memory/VectorDatabase';
import { IAIProvider } from '../../ai/AIProvider';

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

  constructor(private vectorDb: VectorDatabase, private aiProvider: IAIProvider) {}

  async execute(args: any, config: ToolConfig): Promise<any> {
    if (!this.aiProvider.generateEmbeddings) {
      return { success: false, error: 'Current AI Provider does not support embeddings. Ensure Ollama is running and "ollama pull nomic-embed-text" is downloaded.' };
    }
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

  constructor(private vectorDb: VectorDatabase, private aiProvider: IAIProvider) {}

  async execute(args: any, config: ToolConfig): Promise<any> {
    if (!this.aiProvider.generateEmbeddings) {
      return { success: false, error: 'Current AI Provider does not support embeddings. Ensure Ollama is running and "ollama pull nomic-embed-text" is downloaded.' };
    }
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

import { WorkspaceIndexer } from '../../memory/WorkspaceIndexer';

export class IngestKnowledgeBaseTool implements ITool {
  name = 'IngestKnowledgeBaseTool';
  description = 'Recursively reads a directory of files (markdown, text, etc.), chunks them, and ingests them into the Vector Database. Use this to bulk-ingest personal knowledge bases or documentation.';
  permissionTier: 1 | 2 | 3 = 2; // Medium risk since it reads many files and spends compute

  inputSchema = {
    type: 'object',
    properties: {
        directoryPath: { type: 'string', description: 'The absolute path to the directory to ingest.' }
    },
    required: ['directoryPath']
  };

  constructor(private vectorDb: VectorDatabase, private aiProvider: IAIProvider) {}

  async execute(args: any, config: ToolConfig): Promise<any> {
    if (!this.aiProvider.generateEmbeddings) {
      return { success: false, error: 'Current AI Provider does not support embeddings.' };
    }
    
    // We can reuse the WorkspaceIndexer logic for this directory
    // Casting aiProvider to any since WorkspaceIndexer expects GeminiAIProvider strictly in its constructor (legacy)
    const indexer = new WorkspaceIndexer(args.directoryPath, this.vectorDb, this.aiProvider as any);
    
    try {
        await indexer.startIndexing();
        return { success: true, message: `Successfully scanned and ingested directory: ${args.directoryPath}` };
    } catch (e: any) {
        return { success: false, error: `Failed to ingest: ${e.message}` };
    }
  }
}
