import { IAIProvider, ConversationMessage, AIOptions } from './AIProvider';

export class GroqUsageTracker {
  public static tokensRemainingToday: number = -1;
  public static requestsRemainingToday: number = -1;
  
  static updateFromHeaders(headers: Headers) {
      const remTokens = headers.get('x-ratelimit-remaining-tokens-today');
      const remReqs = headers.get('x-ratelimit-remaining-requests-today');
      
      let updated = false;
      if (remTokens) {
        this.tokensRemainingToday = parseInt(remTokens, 10);
        updated = true;
      }
      if (remReqs) {
        this.requestsRemainingToday = parseInt(remReqs, 10);
        updated = true;
      }
      
      if (updated) {
          console.log(`[QUOTA] Groq limits remaining today: ${this.requestsRemainingToday} reqs, ${this.tokensRemainingToday} tokens`);
      }
  }
}

export class GroqAIProvider implements IAIProvider {
  private groqApiKey = process.env.GROQ_API_KEY || '';
  private groqBaseUrl = 'https://api.groq.com/openai/v1/chat/completions';
  private defaultModel = 'openai/gpt-oss-20b';

  private mapMessages(messages: ConversationMessage[]) {
    return messages.map(m => {
      let role = m.role;
      if (m.parts && m.parts.length > 0) {
        if (m.parts[0].functionCall) {
          return {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_' + Math.random().toString(36).substring(7),
              type: 'function',
              function: {
                name: m.parts[0].functionCall.name,
                arguments: JSON.stringify(m.parts[0].functionCall.args)
              }
            }]
          };
        }
        if (m.parts[0].functionResponse) {
          return {
            role: 'tool',
            tool_call_id: 'call_fallback',
            name: m.parts[0].functionResponse.name,
            content: JSON.stringify(m.parts[0].functionResponse.response)
          };
        }
      }
      return { role, content: m.content };
    });
  }

  private mapTools(tools?: any[]) {
    if (!tools || tools.length === 0) return undefined;
    return tools.map(t => {
      const toolDecl = t.functionDeclarations?.[0];
      if (!toolDecl) return null;

      // Deep copy and convert Gemini uppercase types to OpenAI lowercase types
      const convertTypes = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(convertTypes);
        
        const newObj: any = {};
        for (const [k, v] of Object.entries(obj)) {
          if (k === 'type' && typeof v === 'string') {
            newObj[k] = v.toLowerCase();
          } else {
            newObj[k] = convertTypes(v);
          }
        }
        return newObj;
      };

      const openaiParameters = convertTypes(toolDecl.parameters);

      return {
        type: 'function',
        function: {
          name: toolDecl.name,
          description: toolDecl.description,
          parameters: openaiParameters
        }
      };
    }).filter(Boolean);
  }



  private async executeWithFailover(requestBody: any): Promise<Response> {
    try {
      const response = await fetch(this.groqBaseUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.groqApiKey}`
        },
        body: JSON.stringify({ ...requestBody, model: this.defaultModel })
      });
      
      GroqUsageTracker.updateFromHeaders(response.headers);

      if (response.ok || (response.status !== 429 && response.status < 500)) {
        return response;
      }
      console.warn(`[ARVON][LLM] Groq HTTP ${response.status}, triggering failover...`);
    } catch (e: any) {
      console.warn(`[ARVON][LLM] Groq connection failed (${e.message}), triggering failover...`);
    }

    // Failover to Local Ollama
    console.log('[ARVON][LLM] Routing request to local Ollama fallback (llama3.2)');
    return fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody, model: 'llama3.2' })
    });
  }

  public async generateResponse(messages: ConversationMessage[], options?: AIOptions): Promise<string> {
    const t0 = performance.now();
    console.log(`[PERF][LLM] Initiating connection to Groq API`);

    let currentMessages = [...messages];
    let isFunctionCalling = true;
    let finalResponseText = '';

    while (isFunctionCalling) {
        isFunctionCalling = false;
        try {
            const mappedMessages = this.mapMessages(currentMessages);
            const mappedTools = this.mapTools(options?.tools);

            const requestBody: any = {
              messages: mappedMessages,
              temperature: options?.temperature ?? 0.7,
              stream: false
            };

            if (mappedTools && mappedTools.length > 0) {
              requestBody.tools = mappedTools;
              requestBody.tool_choice = 'auto';
            }

            const response = await this.executeWithFailover(requestBody);

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
            }

            const data = await response.json();
            const choice = data.choices[0];

            if (choice.message.tool_calls && choice.message.tool_calls.length > 0 && options?.onFunctionCall) {
                const currentFunctionCall = choice.message.tool_calls[0];
                const callName = currentFunctionCall.function.name;
                const callArgs = JSON.parse(currentFunctionCall.function.arguments || '{}');
                console.log(`[ARVON][LLM] LLM invoked tool: ${callName}`);
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
                console.log(`[ARVON][LLM] Returning tool result to LLM...`);
            } else {
                finalResponseText = choice.message.content || "I'm sorry, I couldn't generate a response.";
            }

        } catch (error: any) {
            console.error(`[ARVON][LLM] API Error:`, error);
            console.log(`[PERF][LLM] Error after ${Math.round(performance.now() - t0)}ms: ${error.message}`);
            throw new Error(`AI Provider Failure: ${error.message}`);
        }
    }

    const tConnection = performance.now();
    console.log(`[PERF][LLM] Full response received in ${Math.round(tConnection - t0)}ms`);
    return finalResponseText;
  }

  public async *stream(messages: ConversationMessage[], options?: AIOptions): AsyncIterable<string> {
    const t0 = performance.now();
    console.log(`[PERF][LLM] Initiating streaming connection to Groq API`);

    let currentMessages = [...messages];
    let isFunctionCalling = true;

    while (isFunctionCalling) {
        isFunctionCalling = false; 
        const mappedMessages = this.mapMessages(currentMessages);
        const mappedTools = this.mapTools(options?.tools);

        const requestBody: any = {
          messages: mappedMessages,
          temperature: options?.temperature ?? 0.7,
          stream: true
        };

        if (mappedTools && mappedTools.length > 0) {
          requestBody.tools = mappedTools;
          requestBody.tool_choice = 'auto';
        }

        let response;
        try {
            response = await this.executeWithFailover(requestBody);
        } catch (e: any) {
            console.log(`[PERF][LLM] Connection failed after ${Math.round(performance.now() - t0)}ms: ${e.message}`);
            throw e;
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Groq HTTP error! status: ${response.status} - ${errText}`);
        }
        if (!response.body) throw new Error('ReadableStream not supported');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        let currentToolCall: any = null;
        let toolCallName = '';
        let toolCallArgs = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '' && line.trim() !== 'data: [DONE]');
            
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const parsed = JSON.parse(line.slice(6));
                    const delta = parsed.choices[0]?.delta;
                    
                    if (delta?.tool_calls) {
                        const tc = delta.tool_calls[0];
                        if (tc.function?.name) toolCallName += tc.function.name;
                        if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
                        currentToolCall = true;
                    }
                    
                    if (delta?.content) {
                        yield delta.content;
                    }
                } catch (e) {
                }
            }
        }

        if (currentToolCall && options?.onFunctionCall) {
            console.log(`[ARVON][LLM] Groq invoked tool: ${toolCallName}`);
            isFunctionCalling = true;
            let callArgs = {};
            try { callArgs = JSON.parse(toolCallArgs); } catch(e){}

            currentMessages.push({
                role: 'assistant',
                content: '',
                parts: [{ functionCall: { name: toolCallName, args: callArgs } }]
            });

            let resultObj;
            try {
                resultObj = await options.onFunctionCall({ name: toolCallName, args: callArgs });
            } catch (e: any) {
                resultObj = { error: e.message };
            }

            currentMessages.push({
                role: 'tool',
                content: '',
                parts: [{
                    functionResponse: { name: toolCallName, response: resultObj }
                }]
            });
            console.log(`[ARVON][LLM] Returning tool result to Groq and resuming stream...`);
        }
    }
  }

  public async generateEmbeddings(text: string): Promise<number[]> {
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
      return data.embedding || [];
    } catch (e: any) {
      return [];
    }
  }
}
