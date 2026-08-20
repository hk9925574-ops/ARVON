import { ConversationMessage } from '../ai/AIProvider';
import { MemoryManager } from '../memory/MemoryManager';

export class ConversationManager {
  private history: ConversationMessage[] = [];
  private maxHistory: number;
  private memoryManager: MemoryManager;

  private systemPrompt = `You are ARVON, a fast desktop AI assistant.
Be concise, natural, and useful.
Respond conversationally.
Do not claim to have performed an action unless a tool actually performed it.
Keep normal voice responses extremely short.
Respond in exactly 1 short sentence.`;

  constructor(memoryManager: MemoryManager, maxHistory: number = 10) {
    this.memoryManager = memoryManager;
    this.maxHistory = maxHistory; // 10 messages = 5 turns
  }

  public addUserMessage(content: string) {
    this.history.push({ role: 'user', content });
    this.pruneHistory();
  }

  public addAssistantMessage(content: string) {
    this.history.push({ role: 'assistant', content });
    this.pruneHistory();
  }

  public getMessagesForAI(): ConversationMessage[] {
    let systemContent = this.systemPrompt;
    
    // Inject long-term memory into the system prompt if available
    const memoryString = this.memoryManager.getAllMemoriesString();
    if (memoryString) {
      systemContent += `\n\nUSER PREFERENCES & MEMORY:\n${memoryString}`;
    }

    return [
      { role: 'system', content: systemContent },
      ...this.history
    ];
  }

  private pruneHistory() {
    if (this.history.length > this.maxHistory) {
      // Keep only the most recent messages
      this.history = this.history.slice(this.history.length - this.maxHistory);
    }
  }
}
