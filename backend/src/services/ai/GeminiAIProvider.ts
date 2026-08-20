import { GoogleGenAI } from '@google/genai';
import { IAIProvider, ConversationMessage, AIOptions } from './AIProvider';

export class GeminiAIProvider implements IAIProvider {
  private ai: GoogleGenAI;
  private defaultModel = 'gemini-flash-lite-latest';

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  private mapMessages(messages: ConversationMessage[]) {
    // Extract the system instructions and format the rest for Gemini
    const systemMsgs = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const history = messages.filter(m => m.role !== 'system').map(m => {
      let role = m.role === 'assistant' ? 'model' : m.role === 'tool' ? 'user' : 'user';
      if (m.parts && m.parts.length > 0) {
        return {
          role,
          parts: m.parts.map(p => {
             if (p.text) return { text: p.text };
             if (p.inlineData) return { inlineData: p.inlineData };
             if (p.functionCall) return { functionCall: p.functionCall };
             if (p.functionResponse) return { functionResponse: p.functionResponse };
             return { text: '' };
          })
        };
      }
      return {
        role,
        parts: [{ text: m.content }]
      };
    });
    return { systemInstruction: systemMsgs, contents: history };
  }

  private async executeWithRetry<T>(
    operationName: string,
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await operation();
      } catch (error: any) {
        attempt++;
        let statusCode = 500;
        if (typeof error?.status === 'number') statusCode = error.status;
        else if (typeof error?.response?.status === 'number') statusCode = error.response.status;
        else if (typeof error?.code === 'number') statusCode = error.code;
        
        // Sometimes the error object embeds JSON inside the message property
        const msg = (error?.message || '').toLowerCase();
        
        const isRetryable = 
          statusCode === 503 || 
          statusCode === 429 || 
          statusCode >= 500 || 
          msg.includes('503') || 
          msg.includes('429') || 
          msg.includes('fetch failed') || 
          msg.includes('timeout') ||
          msg.includes('service unavailable');
        
        if (!isRetryable || attempt >= maxRetries) {
          throw error;
        }

        // Exponential backoff: 2s, 4s, 8s + jitter
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        console.log(`[PERF][LLM][RETRY] ${operationName} failed (Attempt ${attempt}/${maxRetries}). Reason: ${error.message}. Retrying in ${Math.round(backoffMs)}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  public async generateResponse(messages: ConversationMessage[], options?: AIOptions): Promise<string> {
    const t0 = performance.now();
    console.log(`[PERF][LLM] Initiating connection to Gemini API (Model: ${this.defaultModel})`);

    let currentMessages = [...messages];
    let isFunctionCalling = true;
    let finalResponseText = '';

    while (isFunctionCalling) {
        isFunctionCalling = false;
        try {
            const { systemInstruction, contents } = this.mapMessages(currentMessages);
            
            const response = await this.executeWithRetry('Gemini API Request', async () => {
                return await this.ai.models.generateContent({
                model: this.defaultModel,
                contents: contents,
                config: {
                    systemInstruction: systemInstruction ? systemInstruction : undefined,
                    temperature: options?.temperature ?? 0.7,
                    tools: options?.tools,
                }
                });
            }, 3);
            
            if (response.functionCalls && response.functionCalls.length > 0 && options?.onFunctionCall) {
                const currentFunctionCall = response.functionCalls[0];
                const callName = currentFunctionCall.name || 'unknown_tool';
                const callArgs = currentFunctionCall.args || {};
                console.log(`[ARVON][LLM] Gemini invoked tool: ${callName}`);
                isFunctionCalling = true;

                currentMessages.push({
                    role: 'assistant',
                    content: '',
                    parts: [{ functionCall: { name: callName, args: callArgs } }]
                });

                let resultObj;
                try {
                    resultObj = await options.onFunctionCall({ name: callName, args: callArgs });
                } catch (e: any) {
                    resultObj = { error: e.message };
                }

                currentMessages.push({
                    role: 'tool',
                    content: '',
                    parts: [{
                        functionResponse: { name: callName, response: resultObj }
                    }]
                });
                console.log(`[ARVON][LLM] Returning tool result to Gemini...`);
            } else {
                finalResponseText = response.text || "I'm sorry, I couldn't generate a response.";
            }

        } catch (error: any) {
            console.error(`[ARVON][LLM] Gemini API Error:`, error);
            console.log(`[PERF][LLM] Error after ${Math.round(performance.now() - t0)}ms: ${error.message}`);
            return "Sorry, I encountered an error communicating with the Gemini API. Please check your API key.";
        }
    }

    const tConnection = performance.now();
    console.log(`[PERF][LLM] Full response received from Gemini in ${Math.round(tConnection - t0)}ms`);
    return finalResponseText;
  }

  public async *stream(messages: ConversationMessage[], options?: AIOptions): AsyncIterable<string> {
    const t0 = performance.now();
    console.log(`[PERF][LLM] Initiating streaming connection to Gemini API (${this.defaultModel})`);

    // Keep a local copy of messages so we can append function calls and responses during the loop
    let currentMessages = [...messages];
    let isFunctionCalling = true;

    while (isFunctionCalling) {
        isFunctionCalling = false; // We assume we will finish unless a function call happens
        const { systemInstruction, contents } = this.mapMessages(currentMessages);

        try {
            const responseStream = await this.executeWithRetry('Gemini API Stream', async () => {
                return await this.ai.models.generateContentStream({
                model: this.defaultModel,
                contents: contents,
                config: {
                    systemInstruction: systemInstruction ? systemInstruction : undefined,
                    temperature: options?.temperature ?? 0.7,
                    tools: options?.tools,
                }
                });
            }, 3);

            let hasYieldedText = false;
            let currentFunctionCall: any = null;

            for await (const chunk of responseStream) {
                // If it's a function call chunk
                if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                    currentFunctionCall = chunk.functionCalls[0];
                    break; // break the stream processing to handle it
                }
                
                if (chunk.text) {
                    hasYieldedText = true;
                    yield chunk.text;
                }
            }

            if (currentFunctionCall && options?.onFunctionCall) {
                const callName = currentFunctionCall.name || 'unknown_tool';
                const callArgs = currentFunctionCall.args || {};
                console.log(`[ARVON][LLM] Gemini invoked tool: ${callName}`);
                isFunctionCalling = true; // We need to loop again

                // 1. Append the model's function call to current messages
                currentMessages.push({
                    role: 'assistant',
                    content: '',
                    parts: [{ functionCall: { name: callName, args: callArgs } }]
                });

                // 2. Execute the tool locally
                let resultObj;
                try {
                    resultObj = await options.onFunctionCall({ name: callName, args: callArgs });
                } catch (e: any) {
                    resultObj = { error: e.message };
                }

                // 3. Append the tool response
                currentMessages.push({
                    role: 'tool',
                    content: '',
                    parts: [{
                        functionResponse: {
                            name: callName,
                            response: resultObj
                        }
                    }]
                });

                console.log(`[ARVON][LLM] Returning tool result to Gemini and resuming stream...`);
            } else if (currentFunctionCall) {
               console.warn(`[ARVON][LLM] Model requested tool ${currentFunctionCall.name} but no onFunctionCall handler was provided!`);
            }

        } catch (e: any) {
            console.log(`[PERF][LLM] Connection/Streaming failed after ${Math.round(performance.now() - t0)}ms: ${e.message}`);
            throw e;
        }
    }
  }

  public async generateEmbeddings(text: string): Promise<number[]> {
    const t0 = performance.now();
    try {
        const response = await this.executeWithRetry('Gemini Embeddings', async () => {
            return await this.ai.models.embedContent({
                model: 'gemini-embedding-2',
                contents: text
            });
        }, 3);
        
        console.log(`[PERF][LLM] Embeddings generated in ${Math.round(performance.now() - t0)}ms`);
        return response.embeddings?.[0]?.values || [];
    } catch (e: any) {
        console.error(`[ARVON][LLM] Embeddings API Error:`, e);
        return [];
    }
  }
}
