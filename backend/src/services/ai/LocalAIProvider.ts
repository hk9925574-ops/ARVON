import { IAIProvider, ConversationMessage, AIOptions } from './AIProvider';

export class LocalAIProvider implements IAIProvider {
  private ollamaBaseUrl = process.env.AI_BASE_URL ? `${process.env.AI_BASE_URL.replace('/v1', '/api/chat')}` : 'http://127.0.0.1:11434/api/chat';
  private defaultModel = process.env.AI_MODEL || 'llama3.2:1b';

  public async generateResponse(messages: ConversationMessage[], options?: AIOptions): Promise<string> {
    const t0 = performance.now();
    console.log(`[PERF][LLM] Initiating connection to ${this.ollamaBaseUrl} (Model: ${this.defaultModel})`);

    try {
      const requestBody = {
        model: this.defaultModel,
        messages: messages,
        stream: false,
        options: {
          num_predict: 40,
          temperature: options?.temperature || 0.7,
        }
      };

      const response = await fetch(this.ollamaBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      const tConnection = performance.now();
      console.log(`[PERF][LLM] Full response received in ${Math.round(tConnection - t0)}ms`);

      if (!response.ok) {
        throw new Error(`Ollama HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const aiText = data.message?.content || "I'm sorry, I couldn't generate a response.";

      return aiText;
    } catch (error: any) {
      console.error(`[ARVON][LLM] Local API Error:`, error);
      console.log(`[PERF][LLM] Error after ${Math.round(performance.now() - t0)}ms: ${error.message}`);
      return "Sorry, I'm having trouble connecting to my local AI engine. Make sure Ollama is running.";
    }
  }
  public async *stream(messages: ConversationMessage[], options?: AIOptions): AsyncIterable<string> {
    const t0 = performance.now();
    console.log(`[PERF][LLM] Initiating streaming connection to ${this.ollamaBaseUrl}`);

    const requestBody = {
      model: this.defaultModel,
      messages: messages,
      stream: true,
      options: {
        num_predict: options?.maxTokens || 800,
        temperature: options?.temperature || 0.7,
      }
    };

    let response;
    try {
      response = await fetch(this.ollamaBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
    } catch (e: any) {
      console.log(`[PERF][LLM] Connection failed after ${Math.round(performance.now() - t0)}ms: ${e.message}`);
      throw e;
    }

    const tConnection = performance.now();
    console.log(`[PERF][LLM] Connection established in ${Math.round(tConnection - t0)}ms. Waiting for first token...`);

    if (!response.ok) {
      throw new Error(`Ollama HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('ReadableStream not supported in response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let firstToken = true;
    let lastTokenTime = tConnection;
    let tokenCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              const now = performance.now();
              if (firstToken) {
                console.log(`[PERF][LLM] Time To First Token (TTFT): ${Math.round(now - tConnection)}ms (Total: ${Math.round(now - t0)}ms)`);
                firstToken = false;
              } else if (tokenCount % 10 === 0) {
                // Log every 10th token to avoid massive console spam
                console.log(`[PERF][LLM] Token ${tokenCount} delay: ${Math.round(now - lastTokenTime)}ms`);
              }
              lastTokenTime = now;
              tokenCount++;
              yield parsed.message.content;
            }
          } catch (e) {
            // Ignore parse errors on incomplete chunks
          }
        }
      }

      const tEnd = performance.now();
      const totalTimeSecs = (tEnd - t0) / 1000;
      console.log(`[PERF][LLM] Stream complete. Tokens: ${tokenCount}. Speed: ${(tokenCount / totalTimeSecs).toFixed(2)} tokens/sec. Total time: ${Math.round(tEnd - t0)}ms`);
    } finally {
      reader.releaseLock();
    }
  }

  public async generateEmbeddings(text: string): Promise<number[]> {
    const t0 = performance.now();
    try {
      const response = await fetch('http://127.0.0.1:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: text
        })
      });
      if (!response.ok) return [];
      const data = await response.json();
      console.log(`[PERF][LLM] Local Embeddings generated in ${Math.round(performance.now() - t0)}ms`);
      return data.embedding || [];
    } catch (e: any) {
      console.error(`[ARVON][LLM] Local Embeddings API Error:`, e);
      return [];
    }
  }
}
