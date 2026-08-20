import { ITool, ToolConfig, ToolRegistry } from '../ToolRegistry';
import { GeminiAIProvider } from '../../ai/GeminiAIProvider';

export const activeAgents: { id: string, task: string, status: string, logs: string[] }[] = [];

abstract class BaseSpawnAgentTool implements ITool {
  abstract name: string;
  abstract description: string;
  abstract systemPromptTemplate: string;
  permissionTier: 1 | 2 | 3 = 1;

  inputSchema = {
    type: 'object',
    properties: {
        taskDescription: { type: 'string', description: 'A detailed description of the goal the agent needs to achieve.' }
    },
    required: ['taskDescription']
  };

  constructor(
      protected aiProvider: GeminiAIProvider, 
      protected toolRegistry: ToolRegistry,
      protected onAgentComplete: (result: string) => void,
      protected onAgentProgress: (msg: string) => void
  ) {}

  async execute(args: any, config: ToolConfig): Promise<any> {
    const agentId = `${this.name}_${Date.now()}`;
    const agentData: { id: string, task: string, status: string, logs: string[] } = { id: agentId, task: args.taskDescription, status: 'Running', logs: [] };
    activeAgents.push(agentData);

    // Start background loop
    this.runAgentLoop(args.taskDescription, agentData).catch(err => {
        agentData.status = 'Error';
        agentData.logs.push(`Agent encountered a fatal error: ${err.message}`);
        this.onAgentProgress(`Agent encountered a fatal error: ${err.message}`);
    });

    return { 
        success: true, 
        message: `${this.name} spawned successfully. It is running in the background and will notify the user upon completion.` 
    };
  }

  private async runAgentLoop(task: string, agentData: any) {
      agentData.logs.push('Agent initialized. Starting task...');
      this.onAgentProgress('Agent initialized. Starting task...');
      
      const messages: any[] = [{
          role: 'system',
          content: `${this.systemPromptTemplate} Your goal is: ${task}
          You have access to tools. Use them to accomplish your goal.
          When you have completely achieved your goal, you MUST call the "EndAgentTaskTool" with your final summarized result.
          Do NOT stop until you call EndAgentTaskTool.`
      }, {
          role: 'user',
          content: 'Begin your task.'
      }];

      let isFinished = false;

      const aiOptions = {
          tools: this.toolRegistry.getGeminiToolDeclarations(),
          onFunctionCall: async (call: { name: string, args: any }) => {
              if (call.name === 'EndAgentTaskTool') {
                  isFinished = true;
                  agentData.status = 'Finished';
                  agentData.logs.push('Task completed.');
                  this.onAgentComplete(call.args.finalResult);
                  return { success: true };
              }
              agentData.logs.push(`Executing ${call.name}...`);
              this.onAgentProgress(`Agent executing ${call.name}...`);
              return await this.toolRegistry.executeTool(call.name, call.args);
          }
      };

      try {
          while (!isFinished) {
              const response = await this.aiProvider.generateResponse(messages, aiOptions);
              messages.push({ role: 'assistant', content: response });
              if (!isFinished) {
                 agentData.logs.push(`Thought: ${response}`);
                 this.onAgentProgress(`Agent thought: ${response}`);
                 messages.push({ role: 'user', content: 'Continue. Remember to call EndAgentTaskTool when fully done.' });
              }
          }
      } catch (err: any) {
          agentData.status = 'Error';
          agentData.logs.push(`Agent loop failed: ${err.message}`);
          this.onAgentProgress(`Agent loop failed: ${err.message}`);
      }
  }
}

export class SpawnResearchAgentTool extends BaseSpawnAgentTool {
    name = 'SpawnResearchAgentTool';
    description = 'Spawns a background Research Agent. Use this for deep investigation, reading documentation, browsing the web, and synthesizing information.';
    systemPromptTemplate = 'You are a highly analytical Research Agent for ARVON. Your specialty is deep investigation, reading documentation, browsing the web, and synthesizing complex information. You should not modify the system or write code unless explicitly required to perform your research.';
}

export class SpawnCoderAgentTool extends BaseSpawnAgentTool {
    name = 'SpawnCoderAgentTool';
    description = 'Spawns a background Coder Agent. Use this for writing software, fixing bugs, and executing terminal commands to test code.';
    systemPromptTemplate = 'You are a highly skilled Coder Agent for ARVON. Your specialty is writing software, manipulating the file system, and executing terminal commands to test and fix your code. You are pragmatic, test-driven, and autonomous.';
}

export class EndAgentTaskTool implements ITool {
    name = 'EndAgentTaskTool';
    description = 'Call this tool when you have finished your assigned background task.';
    permissionTier: 1 | 2 | 3 = 1;

    inputSchema = {
        type: 'object',
        properties: {
            finalResult: { type: 'string', description: 'The final summary or result of your task.' }
        },
        required: ['finalResult']
    };

    async execute(args: any, config: ToolConfig): Promise<any> {
        return { success: true }; // Actually handled inside the onFunctionCall hook above
    }
}
