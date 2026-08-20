import * as fs from 'fs/promises';
import * as path from 'path';
import { VectorDatabase } from './VectorDatabase';
import { GeminiAIProvider } from '../ai/GeminiAIProvider';

export class WorkspaceIndexer {
  private workspacePath: string;
  private vectorDb: VectorDatabase;
  private aiProvider: GeminiAIProvider;
  private isIndexing: boolean = false;

  constructor(workspacePath: string, vectorDb: VectorDatabase, aiProvider: GeminiAIProvider) {
    this.workspacePath = workspacePath;
    this.vectorDb = vectorDb;
    this.aiProvider = aiProvider;
  }

  async startIndexing() {
    if (this.isIndexing) return;
    this.isIndexing = true;
    console.log('[ARVON][Indexer] Starting workspace indexer...');
    
    try {
      await this.scanDirectory(this.workspacePath);
      console.log('[ARVON][Indexer] Workspace indexing complete.');
    } catch (e: any) {
      console.error('[ARVON][Indexer] Failed to index workspace:', e.message);
    } finally {
      this.isIndexing = false;
    }
  }

  private async scanDirectory(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip node_modules, .git, and hidden folders
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue;

        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath);
        } else if (entry.isFile() && this.isIndexable(entry.name)) {
          await this.indexFile(fullPath);
        }
      }
    } catch (e) {
       // Ignore read errors
    }
  }

  private isIndexable(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    const validExts = ['.txt', '.md', '.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h'];
    return validExts.includes(ext);
  }

  private async indexFile(filePath: string) {
    try {
      // Check if this file is already in the DB
      const allRecords = this.vectorDb.getAll();
      const existing = allRecords.find(r => r.metadata?.source === filePath);
      
      const stat = await fs.stat(filePath);
      if (existing && existing.metadata?.mtime === stat.mtimeMs) {
        return; // File hasn't changed
      }

      const content = await fs.readFile(filePath, 'utf-8');
      if (!content || content.trim().length === 0) return;

      // Simple chunking (e.g. by 2000 chars)
      const chunks = this.chunkText(content, 2000);
      
      // Remove old chunks for this file
      if (existing) {
         for (const r of allRecords.filter(rec => rec.metadata?.source === filePath)) {
             this.vectorDb.delete(r.id);
         }
      }

      console.log(`[ARVON][Indexer] Indexing ${filePath} (${chunks.length} chunks)`);
      for (let i = 0; i < chunks.length; i++) {
        const textToEmbed = `File: ${filePath}\nChunk: ${i+1}/${chunks.length}\nContent:\n${chunks[i]}`;
        const embedding = await this.aiProvider.generateEmbeddings(textToEmbed);
        this.vectorDb.insert({
          text: textToEmbed,
          vector: embedding,
          metadata: {
            category: 'workspace',
            source: filePath,
            mtime: stat.mtimeMs
          }
        });
      }
    } catch (e: any) {
      console.error(`[ARVON][Indexer] Failed to index ${filePath}:`, e.message);
    }
  }

  private chunkText(text: string, maxSize: number): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + maxSize));
      i += maxSize;
    }
    return chunks;
  }
}
