import * as fs from 'fs';
import * as path from 'path';

export interface MemoryEntry {
  type: string;
  key: string;
  value: string;
}

export class MemoryManager {
  private memoryFile: string;
  private memories: MemoryEntry[] = [];

  constructor() {
    this.memoryFile = path.join(__dirname, '../../../../data/memory.json');
    this.ensureDirectoryExists();
    this.loadMemory();
  }

  private ensureDirectoryExists() {
    const dir = path.dirname(this.memoryFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadMemory() {
    try {
      if (fs.existsSync(this.memoryFile)) {
        const data = fs.readFileSync(this.memoryFile, 'utf8');
        this.memories = JSON.parse(data);
      }
    } catch (e) {
      console.error('[ARVON][Memory] Failed to load memory:', e);
      this.memories = [];
    }
  }

  private saveMemory() {
    try {
      fs.writeFileSync(this.memoryFile, JSON.stringify(this.memories, null, 2));
    } catch (e) {
      console.error('[ARVON][Memory] Failed to save memory:', e);
    }
  }

  public save(type: string, key: string, value: string) {
    const existingIndex = this.memories.findIndex(m => m.key === key && m.type === type);
    
    if (existingIndex >= 0) {
      this.memories[existingIndex].value = value;
    } else {
      this.memories.push({ type, key, value });
    }
    
    this.saveMemory();
  }

  public get(key: string): string | null {
    const mem = this.memories.find(m => m.key === key);
    return mem ? mem.value : null;
  }

  public getAllMemoriesString(): string {
    if (this.memories.length === 0) return '';
    return this.memories.map(m => `${m.key}: ${m.value}`).join('\n');
  }
}
