import { Intent } from './IntentEngine';

export interface FastIntentResult {
    matched: boolean;
    intent: Intent;
    toolName?: string;
    toolArgs?: any;
    staticResponse?: string;
}

export class FastIntentRouter {
    public determineFastPath(text: string): FastIntentResult {
        const lower = text.toLowerCase().trim();

        // Time check
        if (/(what is the time|what time is it|current time|live time|^time$|tell me the time)/i.test(lower)) {
            return {
                matched: true,
                intent: Intent.SYSTEM_INFORMATION,
                toolName: 'TimeTool',
                toolArgs: {}
            };
        }

        // Simple calculations
        if (lower.startsWith('calculate ') || lower.startsWith('what is ') && lower.match(/[\d\+\-\*\/\(\)]+/)) {
            const expression = lower.replace(/calculate |what is /gi, '').trim();
            // Fast reject if there's complex natural language mixed in
            if (/^[0-9\+\-\*\/\(\)\.\s]+$/.test(expression)) {
                return {
                    matched: true,
                    intent: Intent.MATH,
                    toolName: 'CalculatorTool',
                    toolArgs: { expression }
                };
            }
        }

        // Removed hardcoded 'open application' and 'open website' fast paths 
        // to force them into the main AI pipeline, giving the AI awareness of the tools.

        // CPU / RAM checks
        if (lower.includes('cpu usage') || lower.includes('ram usage') || lower === 'system info') {
            return {
                matched: true,
                intent: Intent.SYSTEM_INFORMATION,
                toolName: 'SystemInfoTool',
                toolArgs: {}
            };
        }

        return { matched: false, intent: Intent.CHAT };
    }
}
