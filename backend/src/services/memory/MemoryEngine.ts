import * as fs from 'fs';
import * as path from 'path';

export enum MemoryCategory {
  PROFILE = 'PROFILE',
  PREFERENCES = 'PREFERENCES',
  PROJECTS = 'PROJECTS',
  GOALS = 'GOALS',
  ROUTINES = 'ROUTINES',
  IMPORTANT_FACTS = 'IMPORTANT_FACTS',
  TEMPORARY_CONTEXT = 'TEMPORARY_CONTEXT'
}

export interface MemoryEntry {
  category: MemoryCategory;
  key: string;
  value: string;
  timestamp: number;
  updatedAt?: number;
  confidence?: number;
  importance?: number;
}

export class MemoryEngine {
  private memoryFile: string;
  private memories: MemoryEntry[] = [];

  constructor() {
    this.memoryFile = path.join(__dirname, '../../../../data/memory_v2.json');
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
      console.error('[ARVON][MemoryEngine] Failed to load memory:', e);
      this.memories = [];
    }
  }

  private saveMemory() {
    try {
      fs.writeFileSync(this.memoryFile, JSON.stringify(this.memories, null, 2));
    } catch (e) {
      console.error('[ARVON][MemoryEngine] Failed to save memory:', e);
    }
  }

  public remember(category: MemoryCategory, key: string, value: string, importance: number = 0.5, confidence: number = 1.0): void {
    // Conflict detection: if we are remembering a fact in the same category with overlapping keywords,
    // we should update it instead of appending it.
    const words = value.toLowerCase().split(/\s+/);
    
    let conflictIndex = this.memories.findIndex(m => m.key === key && m.category === category);
    
    // Heuristic conflict detection based on values if key is generic (like 'user_fact')
    if (conflictIndex === -1 && key === 'user_fact') {
        conflictIndex = this.memories.findIndex(m => {
            if (m.category !== category) return false;
            const mWords = m.value.toLowerCase().split(/\s+/);
            const overlap = mWords.filter(w => words.includes(w) && w.length > 3).length;
            return overlap >= 2; // Arbitrary overlap threshold for conflict
        });
    }

    if (conflictIndex >= 0) {
      // Update with history note if the new value is completely different
      const oldVal = this.memories[conflictIndex].value;
      if (oldVal !== value) {
          this.update(category, this.memories[conflictIndex].key, `${value} (previously: ${oldVal})`);
      }
      this.memories[conflictIndex].confidence = confidence;
      this.memories[conflictIndex].importance = importance;
      this.saveMemory();
    } else {
      this.memories.push({ category, key, value, timestamp: Date.now(), confidence, importance });
      this.saveMemory();
    }
  }

  public retrieve(category?: MemoryCategory, key?: string): MemoryEntry[] {
    this.pruneTemporary();
    return this.memories.filter(m => {
      let matches = true;
      if (category) matches = matches && m.category === category;
      if (key) matches = matches && m.key === key;
      return matches;
    });
  }

  public retrieveRelevant(entities: string[]): Array<{source: string, content: string, confidence: number, retrievedAt: number}> {
      this.pruneTemporary();
      if (this.memories.length === 0) return [];

      const results = this.memories.map(m => {
          let score = 0.1; // Base score
          
          // Relevance
          const lowerVal = m.value.toLowerCase();
          for (const ent of entities) {
              if (lowerVal.includes(ent.toLowerCase())) score += 0.4;
          }

          // Recency
          const ageDays = (Date.now() - m.timestamp) / (1000 * 60 * 60 * 24);
          score -= Math.min(ageDays * 0.05, 0.2); // slight decay for old memories

          // Category weight
          if (m.category === MemoryCategory.PROFILE) score += 0.1;

          return {
              source: `memory:${m.category}`,
              content: `[${m.category}] ${m.key}: ${m.value}`,
              confidence: Math.min(Math.max(score, 0), 1),
              retrievedAt: m.timestamp,
              entry: m
          };
      });

      // Sort by confidence, return top 5 relevant
      const sorted = results.filter(r => r.confidence >= 0.2).sort((a, b) => b.confidence - a.confidence);
      return sorted.slice(0, 5).map(r => ({
          source: r.source,
          content: r.content,
          confidence: r.confidence,
          retrievedAt: r.retrievedAt
      }));
  }

  private pruneTemporary() {
      const TEMPORARY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
      const now = Date.now();
      const initialLength = this.memories.length;
      
      this.memories = this.memories.filter(m => {
          if (m.category === MemoryCategory.TEMPORARY_CONTEXT) {
              return (now - m.timestamp) < TEMPORARY_TTL_MS;
          }
          return true;
      });

      if (this.memories.length !== initialLength) {
          this.saveMemory();
      }
  }

  public update(category: MemoryCategory, key: string, value: string): boolean {
    const existingIndex = this.memories.findIndex(m => m.key === key && m.category === category);
    if (existingIndex >= 0) {
      this.memories[existingIndex].value = value;
      this.memories[existingIndex].timestamp = Date.now();
      this.saveMemory();
      return true;
    }
    return false;
  }

  public forget(category: MemoryCategory, key: string): boolean {
    const initialLength = this.memories.length;
    this.memories = this.memories.filter(m => !(m.key === key && m.category === category));
    if (this.memories.length !== initialLength) {
      this.saveMemory();
      return true;
    }
    return false;
  }

  public clear(category?: MemoryCategory): void {
    if (category) {
      this.memories = this.memories.filter(m => m.category !== category);
    } else {
      this.memories = [];
    }
    this.saveMemory();
  }

  public getAllMemoriesString(): string {
    this.pruneTemporary();
    if (this.memories.length === 0) return '';
    return this.memories.map(m => `[${m.category}] ${m.key}: ${m.value}`).join('\n');
  }
}
