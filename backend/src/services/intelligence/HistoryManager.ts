export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class HistoryManager {
  private messages: Message[] = [];
  private maxHistory: number;

  constructor(maxHistory = 20) {
    this.maxHistory = maxHistory;
  }

  public addMessage(role: 'user' | 'assistant' | 'system', content: string) {
    this.messages.push({ role, content });
  }

  public getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Defines a trim/summarize strategy for conversation state budgeting.
   * Keeps the last N full turns verbatim, and summarizes older turns into a compact rolling summary.
   */
  public buildContextForTurn(maxVerbatimMessages: number = 40): Message[] {
    // With Gemini 1M+ token limit, we can keep significantly more history verbatim.
    // If it exceeds max, we just take the slice, no need to aggressively summarize to 50 chars.
    if (this.messages.length <= maxVerbatimMessages) {
        return [...this.messages];
    }
    return this.messages.slice(-maxVerbatimMessages);
  }

  public clear() {
    this.messages = [];
  }
}
