import { IAIProvider } from '../ai/AIProvider';
import { ConversationManager } from '../conversation/ConversationManager';
import { MemoryManager } from '../memory/MemoryManager';

export type Intent = 'conversation' | 'question' | 'memory_save' | 'memory_recall' | 'unknown';

export class IntentRouter {
  private aiService: IAIProvider;
  private convManager: ConversationManager;
  private memoryManager: MemoryManager;

  constructor(aiService: IAIProvider, convManager: ConversationManager, memoryManager: MemoryManager) {
    this.aiService = aiService;
    this.convManager = convManager;
    this.memoryManager = memoryManager;
  }

  public async routeRequest(text: string, reqId: string): Promise<string> {
    const startTime = performance.now();
    const intent = this.detectIntent(text);
    
    console.log(`[ARVON][${reqId}] Intent detection: ${Math.round(performance.now() - startTime)} ms (${intent})`);

    // Handle memory save explicitly
    if (intent === 'memory_save') {
      this.extractAndSaveMemory(text);
    }

    // Memory lookup is implicit in the system prompt now, but we track the theoretical time
    const memLookupStart = performance.now();
    // Memory is already fetched when convManager.getMessagesForAI() is called inside generate
    console.log(`[ARVON][${reqId}] Memory lookup: ${Math.round(performance.now() - memLookupStart)} ms`);

    // Add user message to history
    this.convManager.addUserMessage(text);

    // AI Request
    const aiStart = performance.now();
    const messages = this.convManager.getMessagesForAI();
    
    const responseText = await this.aiService.generateResponse(messages, { maxTokens: 150 });
    
    console.log(`[ARVON][${reqId}] AI request: ${Math.round(performance.now() - aiStart)} ms`);

    // Add AI response to history
    this.convManager.addAssistantMessage(responseText);

    return responseText;
  }

  private detectIntent(text: string): Intent {
    const lower = text.toLowerCase();
    
    // Simple heuristic intent detection to avoid double LLM calls
    if (lower.startsWith('my name is') || lower.includes('my favorite') || lower.includes('i prefer') || lower.includes('i like')) {
      return 'memory_save';
    }
    
    if (lower.includes('what is my name') || lower.includes('do you remember') || lower.includes('what did i tell you')) {
      return 'memory_recall';
    }

    if (lower.includes('what') || lower.includes('how') || lower.includes('who') || lower.includes('why') || lower.includes('when')) {
      return 'question';
    }

    return 'conversation';
  }

  private extractAndSaveMemory(text: string) {
    const lower = text.toLowerCase();
    
    // Very basic extraction for Phase 3
    if (lower.startsWith('my name is ')) {
      const name = text.substring('my name is '.length).replace('.', '').trim();
      this.memoryManager.save('identity_preference', 'preferred_name', name);
    } else if (lower.includes('my favorite sport is ')) {
      const sport = text.split('my favorite sport is ')[1].replace('.', '').trim();
      this.memoryManager.save('preference', 'favorite_sport', sport);
    }
    // More complex extraction would use an LLM offline worker task
  }
}
