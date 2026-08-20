import * as fs from 'fs';
import * as path from 'path';

export interface VectorRecord {
    id: string;
    text: string;
    vector: number[];
    metadata: any;
    timestamp: number;
    accessCount?: number;
    lastAccessedAt?: number;
}

export class VectorDatabase {
    private records: VectorRecord[] = [];
    private dbPath: string;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
        this.load();
    }

    private load() {
        if (fs.existsSync(this.dbPath)) {
            try {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                this.records = JSON.parse(data);
            } catch (e) {
                console.error('[VectorDB] Failed to load db', e);
            }
        }
    }

    private save() {
        try {
            fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
            fs.writeFileSync(this.dbPath, JSON.stringify(this.records, null, 2), 'utf8');
        } catch (e) {
            console.error('[VectorDB] Failed to save db', e);
        }
    }

    public insert(record: Omit<VectorRecord, 'id' | 'timestamp'>) {
        const fullRecord: VectorRecord = {
            ...record,
            id: Math.random().toString(36).substring(2, 15),
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessedAt: Date.now()
        };
        this.records.push(fullRecord);
        this.save();
        return fullRecord.id;
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    public search(queryVector: number[], limit: number = 5): VectorRecord[] {
        const scored = this.records.map(record => {
            const baseScore = this.cosineSimilarity(queryVector, record.vector);
            const accesses = record.accessCount || 0;
            const daysOld = (Date.now() - record.timestamp) / (1000 * 60 * 60 * 24);
            const decay = Math.max(0.5, 1 - (daysOld * 0.01)); // Slow decay up to 50%
            const promotion = Math.min(1.5, 1 + (accesses * 0.05)); // Boost up to 1.5x for highly used memories
            
            return {
                record,
                score: baseScore * decay * promotion
            };
        });
        
        scored.sort((a, b) => b.score - a.score);
        const results = scored.slice(0, limit).map(s => s.record);

        let mutated = false;
        results.forEach(r => {
            r.accessCount = (r.accessCount || 0) + 1;
            r.lastAccessedAt = Date.now();
            mutated = true;
        });
        if (mutated) this.save();

        return results;
    }

    public delete(id: string) {
        this.records = this.records.filter(r => r.id !== id);
        this.save();
    }

    public getAll(): VectorRecord[] {
        return this.records;
    }

    public clear() {
        this.records = [];
        this.save();
    }
}
