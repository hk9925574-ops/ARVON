import { ActionLogger } from './ActionLogger';
import { Type } from '@google/genai';

export interface ToolConfig {
  allowedPaths: string[];
  restrictedPaths: string[];
  workspacePath: string;
}

export interface ITool {
  name: string;
  description: string;
  permissionTier: 1 | 2 | 3;
  inputSchema: any;
  execute(args: any, config: ToolConfig): Promise<any>;
}

export class ToolRegistry {
  private tools: Map<string, ITool> = new Map();
  private cache: Map<string, { result: any, timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 30000;
  
  private logger: ActionLogger;
  private config: ToolConfig;
  private confirmationResolvers: Map<string, (confirmed: boolean) => void> = new Map();

  constructor(config: ToolConfig, logPath: string) {
    this.config = config;
    this.logger = new ActionLogger(logPath);
  }

  public register(tool: ITool) {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): ITool[] {
    return Array.from(this.tools.values());
  }

  public getGeminiToolDeclarations(): any[] {
    return [{
      functionDeclarations: this.getAllTools().map(tool => {
        const properties: any = {};
        const schemaProps = tool.inputSchema?.properties || {};
        for (const key of Object.keys(schemaProps)) {
           const typeStr = schemaProps[key].type.toUpperCase();
           properties[key] = {
               type: Type[typeStr as keyof typeof Type] || Type.STRING,
               description: schemaProps[key].description || ''
           };
        }
        
        return {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: Type.OBJECT,
            properties: properties,
            required: tool.inputSchema?.required || []
          }
        };
      })
    }];
  }

  private validateSchema(args: any, schema: any): boolean {
    if (!schema || !schema.properties) return true;
    for (const key of Object.keys(schema.properties)) {
        if (schema.required && schema.required.includes(key)) {
            if (args[key] === undefined) return false;
        }
        if (args[key] !== undefined) {
            const expectedType = schema.properties[key].type;
            if (expectedType && typeof args[key] !== expectedType) return false;
        }
    }
    return true;
  }

  public resolveConfirmation(toolExecutionId: string, confirmed: boolean) {
    const resolver = this.confirmationResolvers.get(toolExecutionId);
    if (resolver) {
        resolver(confirmed);
        this.confirmationResolvers.delete(toolExecutionId);
    }
  }

  /**
   * Safe execution proxy that enforces permission tiers, validation, timeouts, and caching.
   * Emits events for Tier 2 (Toast) and Tier 3 (Confirm).
   */
  public async executeTool(
    name: string, 
    args: any, 
    onTier2Log?: (details: any) => void,
    onTier3Confirm?: (details: any, toolExecutionId: string) => void
  ): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);

    if (!this.validateSchema(args, tool.inputSchema)) {
        throw new Error(`Invalid arguments for tool ${name}. Schema mismatch.`);
    }

    // Tier Handling
    if (tool.permissionTier === 3 && onTier3Confirm) {
        const executionId = Math.random().toString(36).substring(7);
        
        const confirmPromise = new Promise<boolean>((resolve) => {
            this.confirmationResolvers.set(executionId, resolve);
            onTier3Confirm({ toolName: name, args }, executionId);
        });

        // 30s timeout for confirmation
        const timeoutPromise = new Promise<boolean>((resolve) => 
            setTimeout(() => {
                if (this.confirmationResolvers.has(executionId)) {
                    this.confirmationResolvers.delete(executionId);
                    resolve(false);
                }
            }, 30000)
        );

        const confirmed = await Promise.race([confirmPromise, timeoutPromise]);
        
        if (!confirmed) {
            this.logger.logAction(name, 3, args, { error: 'User declined or timed out' }, false);
            throw new Error(`Execution of ${name} was cancelled by the user or timed out.`);
        }
    }

    // Caching for idempotent Tier 1 tools
    const isIdempotent = tool.permissionTier === 1 && (name.includes('Info') || name.includes('Time') || name.includes('Calc'));
    const cacheKey = `${name}:${JSON.stringify(args)}`;
    
    if (isIdempotent) {
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
            return cached.result;
        }
    }

    const timeoutMs = 15000;
    const executePromise = tool.execute(args, this.config);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool ${name} timed out`)), timeoutMs));

    try {
        const result = await Promise.race([executePromise, timeoutPromise]);
        
        if (isIdempotent) {
            this.cache.set(cacheKey, { result, timestamp: Date.now() });
        }

        // Log actions for Tier 2 and Tier 3
        if (tool.permissionTier >= 2) {
            this.logger.logAction(name, tool.permissionTier, args, result, true);
            if (tool.permissionTier === 2 && onTier2Log) {
                onTier2Log({ toolName: name, args, message: `Executed ${name}` });
            }
        }

        return result;
    } catch (error: any) {
        if (tool.permissionTier >= 2) {
            this.logger.logAction(name, tool.permissionTier, args, { error: error.message }, false);
        }
        throw error;
    }
  }
}
