import { ITool, ToolConfig, ToolRegistry } from '../ToolRegistry';
import * as cron from 'node-cron';
import { SpawnResearchAgentTool } from './AgentTools';

export const activeSchedules: { id: string, cronExpr: string, task: string, nextRun: string }[] = [];

export class ScheduleTaskTool implements ITool {
    name = 'ScheduleTaskTool';
    description = 'Schedules a background task to execute on a recurring cron schedule. Use standard cron syntax (e.g. "0 8 * * *" for 8 AM daily). The system will automatically spawn a ResearchAgent to fulfill the task at the scheduled time.';
    permissionTier: 1 | 2 | 3 = 1;

    inputSchema = {
        type: 'object',
        properties: {
            cronExpression: { type: 'string', description: 'Standard cron expression (5 fields: min hr dom mon dow).' },
            taskDescription: { type: 'string', description: 'The detailed task the agent should perform when the cron triggers.' }
        },
        required: ['cronExpression', 'taskDescription']
    };

    constructor(private toolRegistry: ToolRegistry) {}

    async execute(args: any, config: ToolConfig): Promise<any> {
        if (!cron.validate(args.cronExpression)) {
            return { success: false, error: 'Invalid cron expression.' };
        }

        const jobId = `job_${Date.now()}`;
        
        const job = cron.schedule(args.cronExpression, () => {
            console.log(`[ARVON][Cron] Triggering scheduled task: ${args.taskDescription}`);
            // Fire and forget a research agent
            const researchAgent = this.toolRegistry.getTool('SpawnResearchAgentTool');
            if (researchAgent) {
                researchAgent.execute({ taskDescription: args.taskDescription }, config).catch(e => {
                    console.error(`[ARVON][Cron] Failed to spawn agent:`, e.message);
                });
            }
        });

        activeSchedules.push({
            id: jobId,
            cronExpr: args.cronExpression,
            task: args.taskDescription,
            nextRun: 'Scheduled'
        });

        return { 
            success: true, 
            message: `Task successfully scheduled to run on cron '${args.cronExpression}'. Job ID: ${jobId}` 
        };
    }
}
