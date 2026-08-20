import * as fs from 'fs';
import * as path from 'path';

export interface VectorRecord {
    id: string;
    text: string;
    vector: number[];
    metadata: any;
    timestamp: number;
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
            timestamp: Date.now()
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
        const scored = this.records.map(record => ({
            record,
            score: this.cosineSimilarity(queryVector, record.vector)
        }));
        
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit).map(s => s.record);
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
