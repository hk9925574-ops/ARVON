import * as fs from 'fs';
import * as path from 'path';

export class ActionLogger {
    private logPath: string;

    constructor(logPath: string) {
        this.logPath = logPath;
        // Ensure directory exists
        const dir = path.dirname(this.logPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    public logAction(toolName: string, tier: 1 | 2 | 3, args: any, result: any, success: boolean) {
        const entry = {
            timestamp: new Date().toISOString(),
            toolName,
            tier,
            args,
            success,
            result: success ? result : result?.error || String(result)
        };
        
        fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n');
    }
}
