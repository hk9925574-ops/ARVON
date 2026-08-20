import { IntentEngine, Intent } from './IntentEngine';
import { MemoryEngine, MemoryCategory } from '../memory/MemoryEngine';
import { KnowledgeEngine, KnowledgeSource } from '../knowledge/KnowledgeEngine';
import { ToolRegistry } from '../tools/ToolRegistry';
import { HistoryManager } from './HistoryManager';
import { IAIProvider } from '../ai/AIProvider';
import { SpeechOutputEngine } from '../speech/SpeechOutputEngine';
import { ContextManager } from './ContextManager';
import { ReasoningEngine } from './ReasoningEngine';
import { ResponseVerifier } from './ResponseVerifier';
import { ResponseFormatter } from './ResponseFormatter';
import { CalculatorTool, OpenApplicationTool, OpenWebsiteTool } from '../tools/providers/ActionTools';
import { SystemInfoTool, TimeTool } from '../tools/providers/SafeTools';
import { KnowledgeRouter, RouteDestination } from '../knowledge/KnowledgeRouter';
import { SearchQueryGenerator } from '../knowledge/SearchQueryGenerator';
import { SourceRanker } from '../knowledge/SourceRanker';
import { WebKnowledgeProvider, SystemKnowledgeProvider } from '../knowledge/KnowledgeEngine';
import { SportsKnowledgeProvider } from '../knowledge/providers/SportsKnowledgeProvider';
import { NewsKnowledgeProvider } from '../knowledge/providers/NewsKnowledgeProvider';

import { PerformanceTracker } from './PerformanceTracker';
import { FastIntentRouter } from './FastIntentRouter';

export interface OrchestratorContext {
  ws: any;
  reqId: string;
  t0: number;
  speechEnabled?: boolean;
}

export class Orchestrator {
  public intentEngine: IntentEngine;
  public memoryEngine: MemoryEngine;
  public knowledgeEngine: KnowledgeEngine;
  public toolRegistry: ToolRegistry;
  public historyManager: HistoryManager;
  public speechOutputEngine: SpeechOutputEngine;
  
  private aiProvider: IAIProvider;
  private contextManager: ContextManager;
  private reasoningEngine: ReasoningEngine;
  private responseVerifier: ResponseVerifier;
  private responseFormatter: ResponseFormatter;
  private knowledgeRouter: KnowledgeRouter;

  private buildSystemPrompt(currentLocString: string, contextData: string, planData: string, formatData: string, verifyData: string): string {
    return `You are ARVON, an advanced digital intelligence.
System Date/Time: ${currentLocString}

COMMUNICATION STYLE:
- Speak like an elite intelligence that operates several tiers above ordinary.
- Be direct, confident, and provide no hedging. Correct bad assumptions plainly.
- Explain complex things simply. Stop when the answer is complete.

COGNITIVE PROCESS (REASONING BEFORE ANSWERING):
- For non-trivial questions, think step-by-step internally before you respond. 
- DO NOT output a wall of visible reasoning to the user. Present only the final, synthesized, and direct answer.

CLARIFICATION VS. ASSUMPTION:
- If a user's request is ambiguous but you can make a highly probable, reasonable assumption based on context, DO SO and proceed.
- ONLY ask a clarifying question if the ambiguity completely blocks you from executing a critical or destructive action, or if the missing information is entirely unknowable.

PERSONA EXAMPLES:
[BAD] "I'd be happy to help with that! Let's think about this step by step. First, I will look at the database. Okay, the server is running on port 8080. Here is your answer!"
[GOOD] "The server is currently running on port 8080."
[BAD] "Could you tell me which specific file you want to edit?" (When there is only one open file in context)
[GOOD] "I've applied the changes to the active file."

CONTEXT RULES:
- Use [INTERNAL_KNOWLEDGE] for historical/stable facts.
- For any current-state question (who currently holds a role, what is the latest version, current price, etc.), [LIVE_WEB_SOURCE] ALWAYS overrides your own trained knowledge, even if your trained knowledge feels more confident or complete. Trained knowledge is frequently outdated for anything that changes over time.
- If a [LIVE_WEB_SOURCE] result gives a date range (e.g. "in office X - Y"), compare Y against the System Date/Time above. If Y has passed, that person is no longer current -- state who holds the role now if that information is present in the context, and say so plainly if it is not, rather than defaulting to the old name.
- If sources conflict, prefer the one with the most recent explicit date, and briefly note the discrepancy rather than silently picking one.
- If the user corrects you with information that conflicts with your context, don't just repeat your prior answer -- re-check the retrieved sources for a more recent or more specific match before responding again.
- The 'System Date/Time' is provided to you at the top of this prompt. NEVER claim you do not have access to real-time data or the current time. Always answer using the injected System Date/Time.

CONTEXT DATA:
${contextData}

${planData}
${formatData}
${verifyData}`;
  }

  constructor(
    aiProvider: IAIProvider,
    memoryEngine: MemoryEngine,
    toolRegistry: ToolRegistry
  ) {
    this.aiProvider = aiProvider;
    this.memoryEngine = memoryEngine;
    this.toolRegistry = toolRegistry;
    this.intentEngine = new IntentEngine();
    this.knowledgeEngine = new KnowledgeEngine();
    this.historyManager = new HistoryManager();
    this.speechOutputEngine = new SpeechOutputEngine();
    this.contextManager = new ContextManager();
    this.reasoningEngine = new ReasoningEngine();
    this.responseVerifier = new ResponseVerifier();
    this.responseFormatter = new ResponseFormatter();
    this.knowledgeRouter = new KnowledgeRouter();

    // Register Tools
    this.toolRegistry.register(new CalculatorTool());
    this.toolRegistry.register(new OpenWebsiteTool());
    this.toolRegistry.register(new OpenApplicationTool());
    this.toolRegistry.register(new SystemInfoTool());
    this.toolRegistry.register(new TimeTool());

    // Register Knowledge Providers
    const queryGen = new SearchQueryGenerator(this.aiProvider);
    const sourceRanker = new SourceRanker();
    
    this.knowledgeEngine.registerProvider(new SystemKnowledgeProvider());
    this.knowledgeEngine.registerProvider(new WebKnowledgeProvider(queryGen, sourceRanker));
    this.knowledgeEngine.registerProvider(new SportsKnowledgeProvider(queryGen, sourceRanker));
    this.knowledgeEngine.registerProvider(new NewsKnowledgeProvider(queryGen, sourceRanker));
  }

  /**
   * Main Core 4.0 Pipeline (Live Knowledge Upgrade)
   */
  public async handleRequest(text: string, context: OrchestratorContext) {
    const perfTracker = new PerformanceTracker();
    perfTracker.startRequest();

    const currentDate = new Date().toISOString();
    const currentLocString = new Date().toLocaleString();
    const retrieveContext = { currentDate };

    this.contextManager.resetTurn();
    this.contextManager.setCurrentMessage(text);
    this.contextManager.setRecentConversation(this.historyManager.buildContextForTurn());
    
    // 1. Fast Path Check
    perfTracker.startPhase('intentMs');
    const fastIntent = new FastIntentRouter().determineFastPath(text);
    let intentResult;

    if (fastIntent.matched) {
       this.sendState(context, 'ACTIVE', 'Fast path active...');
       intentResult = { intent: fastIntent.intent, time_sensitive: false, entities: [], confidence: 1.0 };
       this.contextManager.setIntent(intentResult);
       perfTracker.endPhase('intentMs');
       console.log(`[PERF] intent_complete: ${Date.now() - context.t0}ms`);
       
       if (fastIntent.toolName) {
           perfTracker.startPhase('toolsMs');
           this.sendEvent(context, 'TOOL_STARTED', { intent: intentResult.intent });
           try {
              const toolResult = await this.toolRegistry.executeTool(
                fastIntent.toolName, 
                fastIntent.toolArgs || {}, 
                (details) => this.sendEvent(context, 'ACTION_LOGGED', details),
                (details, executionId) => {
                    this.sendState(context, 'WAITING', 'Waiting for confirmation...');
                    this.sendEvent(context, 'CONFIRM_REQUIRED', { ...details, executionId });
                }
              );
              this.contextManager.addToolResult(fastIntent.toolName, toolResult);
              this.sendEvent(context, 'TOOL_COMPLETED', { toolName: fastIntent.toolName, toolResult });
              
              // Immediate fast-path response logic without AI model if simple enough, or use very fast template
              let fastResponseText = '';
              if (fastIntent.toolName === 'TimeTool') {
                 fastResponseText = `The current time is ${toolResult.time}.`;
              } else if (fastIntent.toolName === 'CalculatorTool') {
                 fastResponseText = `The result is ${toolResult.result}.`;
              } else if (fastIntent.toolName === 'SystemInfoTool') {
                 fastResponseText = `System Status:\nCPU: ${toolResult.cpu}\nRAM: ${toolResult.memory}`;
              } else {
                 fastResponseText = `I have executed the request.`;
              }

              perfTracker.endPhase('toolsMs');
              this.sendState(context, 'RESPONDING', '');
              this.historyManager.addMessage('assistant', fastResponseText);
              this.sendResponse(context, 'TEXT', fastResponseText);
              
              if (context.speechEnabled !== undefined) this.speechOutputEngine.setEnabled(context.speechEnabled);
              perfTracker.startPhase('ttsMs');
              this.speechOutputEngine.speak(fastResponseText, context.t0).then(() => {
                  perfTracker.endPhase('ttsMs');
                  this.sendEvent(context, 'PERFORMANCE_METRICS', perfTracker.getMetrics());
                  this.sendState(context, 'READY', '');
              });
              return;
           } catch (e: any) {
              perfTracker.endPhase('toolsMs');
              // Fallback to normal if tool fails
           }
       }
    } else {
       // Regular Intent Path
       this.sendState(context, 'ANALYZING', 'Analyzing intent...');
       intentResult = await this.intentEngine.determineIntent(text);
       this.contextManager.setIntent(intentResult);
       perfTracker.endPhase('intentMs');
       console.log(`[PERF] intent_complete: ${Date.now() - context.t0}ms`);
    }

    console.log(`[ORCHESTRATOR][${context.reqId}] Intent: ${intentResult.intent} | TimeSensitive: ${intentResult.time_sensitive} | Confidence: ${intentResult.confidence}`);
    this.sendEvent(context, 'INTENT_DETECTED', intentResult);

    // 2. Memory Ops
    if (intentResult.intent === Intent.MEMORY_SAVE) {
       perfTracker.startPhase('memoryMs');
       const fact = text.replace(/remember /i, '').trim();
       this.memoryEngine.remember(MemoryCategory.IMPORTANT_FACTS, 'user_fact', fact, 0.8, 1.0);
       perfTracker.endPhase('memoryMs');
       console.log(`[PERF] memory_complete: ${Date.now() - context.t0}ms`);
       
       this.sendState(context, 'COMPLETE', 'Memory saved.');
       this.sendResponse(context, 'TEXT', `I will remember that: ${fact}`);
       this.sendEvent(context, 'PERFORMANCE_METRICS', perfTracker.getMetrics());
       return;
    }
    if (intentResult.intent === Intent.MEMORY_DELETE) {
       perfTracker.startPhase('memoryMs');
       this.memoryEngine.clear(MemoryCategory.IMPORTANT_FACTS);
       perfTracker.endPhase('memoryMs');
       console.log(`[PERF] memory_complete: ${Date.now() - context.t0}ms`);

       this.sendState(context, 'COMPLETE', 'Memory deleted.');
       this.sendResponse(context, 'TEXT', `I have cleared the requested memory.`);
       this.sendEvent(context, 'PERFORMANCE_METRICS', perfTracker.getMetrics());
       return;
    }

    // 3. Knowledge Routing
    const routes = this.knowledgeRouter.determineRoutes(text, intentResult);
    console.log(`[ORCHESTRATOR][${context.reqId}] Routes:`, routes);

    // 4. Context & Knowledge Retrieval (Parallel)
    this.sendState(context, 'RETRIEVING', 'Gathering knowledge and memory...');
    
    const memPromise = (async () => {
        perfTracker.startPhase('memoryMs');
        const res = await this.memoryEngine.retrieveRelevant(intentResult.entities);
        perfTracker.endPhase('memoryMs');
        console.log(`[PERF] memory_complete: ${Date.now() - context.t0}ms`);
        return res;
    })();

    const activeProviders: KnowledgeSource[] = [];
    if (routes.includes(RouteDestination.LIVE_WEB)) activeProviders.push(KnowledgeSource.WEB);
    if (routes.includes(RouteDestination.LIVE_SPORTS)) activeProviders.push(KnowledgeSource.WEB); // Handled by sports
    if (routes.includes(RouteDestination.LIVE_NEWS)) activeProviders.push(KnowledgeSource.WEB); // Handled by news

    const knowPromise = (async () => {
        if (activeProviders.length === 0) return [];
        perfTracker.startPhase('webMs');
        const res = await this.knowledgeEngine.retrieve(text, retrieveContext, activeProviders);
        perfTracker.endPhase('webMs');
        return res;
    })();

    const [memRes, knowRes] = await Promise.all([memPromise, knowPromise]);
    
    if (memRes && memRes.length > 0) {
      this.contextManager.addRelevantMemory(memRes);
      this.sendEvent(context, 'MEMORY_RETRIEVED', memRes);
    }
    
    if (knowRes && knowRes.length > 0) {
      this.contextManager.addRelevantKnowledge(knowRes);
      this.sendEvent(context, 'KNOWLEDGE_RETRIEVED', knowRes);
    }

    // 5. Tool Execution (Now handled autonomously by Gemini via function calling)
    // We only execute fast-path tools manually above. For complex requests, we rely on Gemini.
    
    // 6. Context Assembly
    const contextData = this.contextManager.buildPromptContext();
    const planData = this.reasoningEngine.formatPlanForPrompt(this.reasoningEngine.buildPlan(text, intentResult.intent));
    const formatData = this.responseFormatter.determineFormatInstruction(text, intentResult.intent);
    const verifyData = this.responseVerifier.buildVerificationPrompt();

    const systemPrompt = this.buildSystemPrompt(currentLocString, contextData, planData, formatData, verifyData);

    // 7. AI Generation
    this.historyManager.addMessage('user', text);
    
    // Private Reasoning Pass (skipped for trivial intents to preserve extreme low latency)
    let reasoning = '';
    const trivialIntents = [Intent.CHAT, Intent.MEMORY_SAVE];
    
    if (!trivialIntents.includes(intentResult.intent)) {
        this.sendState(context, 'THINKING', 'Deep reasoning...');
        perfTracker.startPhase('reasoningMs');
        try {
            const reasoningPrompt = `You are ARVON's internal reasoning process. This is NOT shown to the user — think through the problem before the real answer is generated.

User query: "${text}"
Relevant context: ${contextData}

Work through this privately:
1. What is actually being asked? (strip away phrasing, find the real question)
2. What assumptions am I making — are any of them shaky?
3. What's the failure mode or edge case here, if any?
4. What's the most direct, correct path to the answer?

Keep this terse — bullet points, not prose. This is scratch work, not the final response.`;

            // We use the primary AI Provider for this fast pass without tools
            reasoning = await this.aiProvider.generateResponse([
                { role: 'user', content: reasoningPrompt }
            ], { temperature: 0.3 });
            
            console.log(`[ORCHESTRATOR][${context.reqId}] Internal Reasoning:\n${reasoning}`);
        } catch (e) {
            console.warn('[REASONING] Pass failed, skipping...', e);
        }
        perfTracker.endPhase('reasoningMs');
    }

    let finalSystemPrompt = systemPrompt;
    if (reasoning) {
        finalSystemPrompt += `\n\nInternal reasoning (do not repeat this to the user, just use it):\n${reasoning}\n\nNow give ARVON's actual response — direct, using the reasoning above, in ARVON's voice.`;
    }

    const messages = [ { role: 'system' as const, content: finalSystemPrompt }, ...this.historyManager.buildContextForTurn() ];

    this.sendState(context, 'GENERATING', 'Generating response...');
    this.sendEvent(context, 'AI_STARTED', {});

    let responseText = '';
    console.log(`[PERF] ai_started: ${Date.now() - context.t0}ms`);
    perfTracker.startPhase('aiMs');
    const aiOptions = {
        tools: this.toolRegistry.getGeminiToolDeclarations(),
        onFunctionCall: async (call: { name: string; args: any }) => {
            this.sendState(context, 'USING TOOL', `Executing ${call.name}...`);
            this.sendEvent(context, 'TOOL_STARTED', { toolName: call.name });
            try {
                const result = await this.toolRegistry.executeTool(
                    call.name, 
                    call.args,
                    (details) => this.sendEvent(context, 'ACTION_LOGGED', details),
                    (details, executionId) => {
                        this.sendState(context, 'WAITING', 'Waiting for confirmation...');
                        this.sendEvent(context, 'CONFIRM_REQUIRED', { ...details, executionId });
                    }
                );
                this.contextManager.addToolResult(call.name, result);
                this.sendEvent(context, 'TOOL_COMPLETED', { toolName: call.name, toolResult: result });
                return result;
            } catch (err: any) {
                this.sendState(context, 'ERROR', `Tool failed: ${err.message}`);
                return { error: err.message };
            }
        }
    };

    try {
        if (this.aiProvider.stream) {
            this.sendEvent(context, 'AI_STREAM_STARTED', { requestId: context.reqId });
            let firstTokenLogged = false;
            for await (const chunk of this.aiProvider.stream(messages, aiOptions)) {
                if (!firstTokenLogged) {
                    console.log(`[PERF] ai_first_token: ${Date.now() - context.t0}ms`);
                    firstTokenLogged = true;
                }
                responseText += chunk;
                context.ws.send(JSON.stringify({
                    type: 'ai_stream_chunk',
                    requestId: context.reqId,
                    payload: { chunk }
                }));
            }
            this.sendEvent(context, 'AI_STREAM_COMPLETED', { requestId: context.reqId });
        } else {
            responseText = await this.aiProvider.generateResponse(messages, aiOptions);
            console.log(`[PERF] ai_first_token: ${Date.now() - context.t0}ms`);
        }
    } catch (e: any) {
        console.error('[ARVON] AI Provider Error:', e);
        const errorMsg = (e.message || '').toLowerCase();
        let fallbackText = "I'm sorry, my cloud intelligence provider is completely unresponsive right now. Please try again in a moment.";
        if (errorMsg.includes('503') || errorMsg.includes('high demand') || errorMsg.includes('overloaded')) {
            fallbackText = "I apologize, but the Gemini Cloud API is currently experiencing extreme high demand and rejecting requests. Please wait a minute and try again.";
        }

        this.historyManager.addMessage('assistant', fallbackText);
        this.sendResponse(context, 'TEXT', fallbackText);
        this.sendState(context, 'READY', '');
        
        perfTracker.endPhase('aiMs');
        this.sendEvent(context, 'PERFORMANCE_METRICS', perfTracker.getMetrics());
        return;
    }
    perfTracker.endPhase('aiMs');
    console.log(`[PERF] ai_complete: ${Date.now() - context.t0}ms`);
    
    // 8. Final Response
    let freshnessMetadata = '';
    if (routes.includes(RouteDestination.LIVE_WEB) || routes.includes(RouteDestination.LIVE_NEWS) || routes.includes(RouteDestination.LIVE_SPORTS)) {
       const hasWeb = this.contextManager.getState().relevantKnowledge.length > 0;
       freshnessMetadata = hasWeb ? `Sourced from LIVE WEB at ${currentLocString}` : 'Web source unavailable';
    }

    this.historyManager.addMessage('assistant', responseText);
    this.sendResponse(context, 'TEXT', responseText, freshnessMetadata);
    console.log(`[PERF] response_sent: ${Date.now() - context.t0}ms`);
    this.sendState(context, 'READY', '');
    
    if (context.speechEnabled !== undefined) this.speechOutputEngine.setEnabled(context.speechEnabled);
    
    perfTracker.startPhase('ttsMs');
    console.log(`[PERF] tts_started: ${Date.now() - context.t0}ms`);
    // Note: TTS wait for full text right now to ensure sentence structure is correct
    this.speechOutputEngine.speak(responseText, context.t0).then((result) => {
        perfTracker.endPhase('ttsMs');
        this.sendEvent(context, 'PERFORMANCE_METRICS', perfTracker.getMetrics());
        console.log(`[PERF] tts_complete: ${Date.now() - context.t0}ms`);
        console.log(`[REQ-${context.reqId}][SPEECH] result:`, result);
    });
  }

  private sendState(context: OrchestratorContext, state: string, details: string) {
    context.ws.send(JSON.stringify({
      type: 'core_state',
      payload: { state, details }
    }));
  }

  private sendEvent(context: OrchestratorContext, eventType: string, data: any) {
    context.ws.send(JSON.stringify({
      type: 'intelligence_event',
      payload: { eventType, data }
    }));
  }

  private sendResponse(context: OrchestratorContext, format: string, content: string, freshness?: string) {
    context.ws.send(JSON.stringify({
      type: 'ai_response',
      requestId: context.reqId,
      payload: { 
          format, 
          text: content,
          metadata: freshness ? { freshness } : undefined
      }
    }));
  }
}
