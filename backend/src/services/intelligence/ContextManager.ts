import { IntentResult } from './IntentEngine';

export interface ContextState {
  currentMessage: string;
  recentConversation: any[];
  activeTopic: string | null;
  userIntent: IntentResult | null;
  relevantMemory: any[];
  relevantKnowledge: any[];
  toolResults: any[];
}

export class ContextManager {
  private state: ContextState;

  constructor() {
    this.state = {
      currentMessage: '',
      recentConversation: [],
      activeTopic: null,
      userIntent: null,
      relevantMemory: [],
      relevantKnowledge: [],
      toolResults: [],
    };
  }

  public resetTurn() {
    this.state.currentMessage = '';
    this.state.userIntent = null;
    this.state.relevantMemory = [];
    this.state.relevantKnowledge = [];
    this.state.toolResults = [];
  }

  public setCurrentMessage(msg: string) {
    this.state.currentMessage = msg;
  }

  public setRecentConversation(history: any[]) {
    // Keep context window small to prevent context explosion
    this.state.recentConversation = history.slice(-5);
  }

  public setIntent(intentResult: IntentResult) {
    this.state.userIntent = intentResult;
    if (intentResult.entities.length > 0) {
      this.state.activeTopic = intentResult.entities.join(' ');
    }
  }

  public addRelevantMemory(memories: any[]) {
    this.state.relevantMemory = memories;
  }

  public addRelevantKnowledge(knowledge: any[]) {
    this.state.relevantKnowledge = knowledge;
  }

  public addToolResult(toolName: string, result: any) {
    this.state.toolResults.push({ toolName, result });
  }

  public buildPromptContext(): string {
    let contextStr = '';
    
    if (this.state.activeTopic) {
      contextStr += `Active Topic: ${this.state.activeTopic}\n\n`;
    }

    if (this.state.relevantMemory.length > 0) {
      contextStr += `User Memory (DO NOT INVENT):\n`;
      this.state.relevantMemory.forEach(m => {
        contextStr += `- [${m.category}] ${m.content} (Confidence: ${m.confidence})\n`;
      });
      contextStr += `\n`;
    }

    if (this.state.relevantKnowledge.length > 0) {
      contextStr += `Retrieved Knowledge:\n`;
      this.state.relevantKnowledge.forEach(k => {
        contextStr += `- [${k.source}] ${k.content}\n`;
      });
      contextStr += `\n`;
    }

    if (this.state.toolResults.length > 0) {
      contextStr += `Tool Execution Results:\n`;
      this.state.toolResults.forEach(r => {
        contextStr += `- [${r.toolName}] ${JSON.stringify(r.result)}\n`;
      });
      contextStr += `\n`;
    }

    return contextStr.trim();
  }

  public getState(): ContextState {
    return this.state;
  }
}
