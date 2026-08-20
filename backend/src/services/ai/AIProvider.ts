export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  parts?: Array<{
    text?: string;
    inlineData?: { mimeType: string; data: string };
    functionCall?: { name: string; args: any };
    functionResponse?: { name: string; response: any };
  }>;
}

export interface AIOptions {
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  onFunctionCall?: (call: { name: string; args: any }) => Promise<any>;
}

export interface IAIProvider {
  generateResponse(
    messages: ConversationMessage[],
    options?: AIOptions
  ): Promise<string>;
  stream?(
    messages: ConversationMessage[],
    options?: AIOptions
  ): AsyncIterable<string>;
  healthCheck?(): Promise<boolean>;
}
