import * as WebSocket from 'ws';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { 
  ClientMessage, 
  PongMessage, 
  AIResponseMessage,
  ErrorMessage
} from '../../shared/types';
import { LocalAIProvider } from './services/ai/LocalAIProvider';
import { GeminiAIProvider } from './services/ai/GeminiAIProvider';
import { GroqAIProvider, GroqUsageTracker } from './services/ai/GroqAIProvider';
import { PiperTTS } from './services/voice/PiperTTS';
import { MemoryManager } from './services/memory/MemoryManager';
import { ConversationManager } from './services/conversation/ConversationManager';
import { IntentRouter } from './services/intent/IntentRouter';
import { VoiceEngine } from './services/voice/VoiceEngine';

// Phase 3 Intelligence Pipeline
import { Orchestrator } from './services/intelligence/Orchestrator';
import { MemoryEngine } from './services/memory/MemoryEngine';
import { ToolRegistry, ToolConfig } from './services/tools/ToolRegistry';
import { SystemInfoTool, TimeTool } from './services/tools/providers/SafeTools';
import { CalculatorTool, OpenApplicationTool, OpenWebsiteTool, RunCommandTool, GitContextTool, ReadClipboardTool } from './services/tools/providers/ActionTools';

import { ReadFSTool, WriteWorkspaceTool, ModifySystemTool, UndoTool } from './services/tools/providers/FSTools';
import { CaptureScreenTool, ScreenDiffTool, OCRTool } from './services/tools/providers/VisionTools';
import { NavigateBrowserTool, ReadPageTool, CloseBrowserTool } from './services/tools/providers/BrowserTools';
import { SaveMemoryTool, SearchMemoryTool, IngestKnowledgeBaseTool } from './services/tools/providers/MemoryTools';
import { ScheduleTaskTool } from './services/tools/providers/SchedulerTools';
import { SpawnResearchAgentTool, SpawnCoderAgentTool, EndAgentTaskTool } from './services/tools/providers/AgentTools';
import { CreateToolTool } from './services/tools/providers/CustomToolGenerator';
import { VectorDatabase } from './services/memory/VectorDatabase';
import { WorkspaceIndexer } from './services/memory/WorkspaceIndexer';
import * as os from 'os';
import * as path from 'path';

// Load environment variables
dotenv.config();

import * as http from 'http';
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    
    // Check Groq
    let groqStatus = 'offline';
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
      });
      if (groqRes.ok) groqStatus = 'online';
    } catch(e) {}

    // Check Ollama
    let ollamaStatus = 'offline';
    try {
      const ollamaRes = await fetch('http://127.0.0.1:11434/api/tags');
      if (ollamaRes.ok) ollamaStatus = 'online';
    } catch(e) {}

    // Check Tavily
    let tavilyStatus = 'offline';
    try {
      const tavilyRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: 'test' })
      });
      if (tavilyRes.ok || tavilyRes.status === 400) tavilyStatus = 'online'; // 400 means API key valid but bad request
    } catch(e) {}

    res.end(JSON.stringify({
      status: 'ok',
      providers: {
        groq: groqStatus,
        ollama: ollamaStatus,
        tavily: tavilyStatus
      },
      usage: {
        requestsRemainingToday: GroqUsageTracker.requestsRemainingToday,
        tokensRemainingToday: GroqUsageTracker.tokensRemainingToday
      }
    }));
    return;
  }
  
  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({ server });
server.listen(PORT, () => {
    console.log(`[ARVON] HTTP & WebSocket server started on port ${PORT}`);
});

// Initialize Legacy Services (Voice)
const aiService = process.env.GROQ_API_KEY ? new GroqAIProvider() : process.env.GEMINI_API_KEY ? new GeminiAIProvider() : new LocalAIProvider();
const memoryManager = new MemoryManager();
const convManager = new ConversationManager(memoryManager);
const intentRouter = new IntentRouter(aiService, convManager, memoryManager);
const ttsEngine = new PiperTTS();
const voiceEngine = new VoiceEngine(intentRouter, ttsEngine);

// Initialize Phase 3 Intelligence Pipeline
const memoryEngine = new MemoryEngine();
const toolConfig: ToolConfig = {
  allowedPaths: [os.homedir()],
  restrictedPaths: [
    'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
    '/System', '/bin', '/sbin', '/usr/bin', '/usr/sbin'
  ],
  workspacePath: path.join(process.cwd(), 'workspace')
};

const toolRegistry = new ToolRegistry(toolConfig, path.join(toolConfig.workspacePath, '.arvon_action_log.jsonl'));
toolRegistry.register(new SystemInfoTool());
toolRegistry.register(new TimeTool());
toolRegistry.register(new CalculatorTool());
toolRegistry.register(new OpenApplicationTool());
toolRegistry.register(new OpenWebsiteTool());
toolRegistry.register(new RunCommandTool((chunk, command) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'terminal_output', payload: { chunk, command } }));
        }
    });
}));
toolRegistry.register(new ReadFSTool());
toolRegistry.register(new WriteWorkspaceTool());
toolRegistry.register(new ModifySystemTool());
toolRegistry.register(new UndoTool());
toolRegistry.register(new CaptureScreenTool());
toolRegistry.register(new ScreenDiffTool());
toolRegistry.register(new OCRTool());
toolRegistry.register(new GitContextTool());
toolRegistry.register(new ReadClipboardTool());
toolRegistry.register(new ScheduleTaskTool(toolRegistry));

// Register Browser Tools
toolRegistry.register(new NavigateBrowserTool());
toolRegistry.register(new ReadPageTool());
toolRegistry.register(new CloseBrowserTool());

const vectorDb = new VectorDatabase(path.join(__dirname, '../../vector_db.json'));
toolRegistry.register(new SaveMemoryTool(vectorDb, aiService as any));
toolRegistry.register(new SearchMemoryTool(vectorDb, aiService as any));
toolRegistry.register(new IngestKnowledgeBaseTool(vectorDb, aiService as any));

// Background RAG Indexer
const workspaceIndexer = new WorkspaceIndexer(toolConfig.workspacePath, vectorDb, aiService as any);
workspaceIndexer.startIndexing(); // fire and forget

// Register Agent Tools
toolRegistry.register(new SpawnResearchAgentTool(
    aiService as any,
    toolRegistry,
    (result) => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'agent_complete', payload: { result } }));
            }
        });
    },
    (msg) => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'agent_progress', payload: { message: msg } }));
            }
        });
    }
));

toolRegistry.register(new SpawnCoderAgentTool(
    aiService as any,
    toolRegistry,
    (result) => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'agent_complete', payload: { result } }));
            }
        });
    },
    (msg) => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'agent_progress', payload: { message: msg } }));
            }
        });
    }
));

toolRegistry.register(new EndAgentTaskTool());
toolRegistry.register(new ScheduleTaskTool(toolRegistry));
toolRegistry.register(new CreateToolTool());
const orchestrator = new Orchestrator(aiService, memoryEngine, toolRegistry);

orchestrator.speechOutputEngine.broadcastAudio = (chunk: Buffer) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            // Send binary frame
            client.send(chunk);
        }
    });
};

console.log(`[ARVON] Starting backend...`);

wss.on('connection', (ws: WebSocket) => {
  console.log('[ARVON] Client connected');

  ws.on('message', async (data: string) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      console.log(`[ARVON] Received message type: ${message.type}`);
      
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (message.type === 'text_request') {
        let text = (message.payload.text || '').trim();
        const reqId = message.requestId || `REQ-${Math.floor(Math.random()*10000)}`;
        const t0 = (message.payload as any).t0 || Date.now();
        console.log(`[PERF] backend_received: ${Date.now() - t0}ms`);
        const ctx: any = { ws, reqId, t0 };
        console.log(`[ARVON] text_request payload:`, { ...message.payload, attachments: message.payload.attachments ? `${message.payload.attachments.length} files` : 'none' });
        if (message.payload.speechEnabled !== undefined) {
          ctx.speechEnabled = message.payload.speechEnabled;
        }

        // Process Attachments
        if (message.payload.attachments && message.payload.attachments.length > 0) {
            const uploadDir = path.join(toolConfig.workspacePath, 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            let attachmentContext = 'I have uploaded the following files to my workspace for you to analyze:\n';
            
            for (const att of message.payload.attachments) {
                // Decode base64
                const base64Data = att.data.replace(/^data:.*?;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                const safeName = att.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                const filePath = path.join(uploadDir, `${Date.now()}_${safeName}`);
                fs.writeFileSync(filePath, buffer);
                attachmentContext += `- ${filePath} (Type: ${att.mimeType})\n`;
            }

            text = `${attachmentContext}\nUser Request: ${text}`;
        }

        await orchestrator.handleRequest(text, ctx);
      } else if (message.type === 'get_memories') {
        ws.send(JSON.stringify({
          type: 'memories_list',
          payload: memoryEngine.retrieve()
        }));
      } else if (message.type === 'forget_memory') {
        memoryEngine.forget(message.payload.category, message.payload.key);
        ws.send(JSON.stringify({ type: 'memories_list', payload: memoryEngine.retrieve() }));
      } else if (message.type === 'clear_memories') {
        memoryEngine.clear();
        ws.send(JSON.stringify({ type: 'memories_list', payload: memoryEngine.retrieve() }));
      } else if (message.type === 'get_vector_memories') {
        ws.send(JSON.stringify({ type: 'vector_memories_list', payload: vectorDb.getAll() }));
      } else if (message.type === 'forget_vector_memory') {
        vectorDb.delete(message.payload.id);
        ws.send(JSON.stringify({ type: 'vector_memories_list', payload: vectorDb.getAll() }));
      } else if (message.type === 'clear_vector_memories') {
        vectorDb.clear();
        ws.send(JSON.stringify({ type: 'vector_memories_list', payload: vectorDb.getAll() }));
      } else if (message.type === 'get_agents') {
        // We need to import activeAgents from AgentTools.ts
        const { activeAgents } = require('./services/tools/providers/AgentTools');
        ws.send(JSON.stringify({ type: 'active_agents_list', payload: activeAgents }));
      } else if (message.type === 'update_speech_settings') {
        orchestrator.speechOutputEngine.setEnabled(!!message.payload.speechEnabled);
      } else if (message.type === 'confirm_action') {
        toolRegistry.resolveConfirmation(message.payload.executionId, message.payload.confirmed);
      } else if (message.type === 'transcribe_audio') {
        // payload should have base64 audio buffer
        const base64Data = message.payload.audioData;
        const buffer = Buffer.from(base64Data, 'base64');
        const reqId = message.requestId || 'REQ-AUDIO';
        
        if (process.env.GROQ_API_KEY) {
          console.log(`[ARVON] Sending audio to Groq Whisper...`);
          // Groq needs a File/Blob format for multipart/form-data. 
          // Since Node 18 fetch supports FormData and Blob, we can construct it.
          const blob = new Blob([buffer], { type: 'audio/wav' });
          const formData = new FormData();
          formData.append('file', blob, 'audio.wav');
          formData.append('model', 'whisper-large-v3-turbo');
          
          fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
            body: formData as any
          }).then(r => r.json()).then(data => {
            ws.send(JSON.stringify({ type: 'transcribe_result', requestId: reqId, payload: { text: data.text || '' } }));
          }).catch(e => {
            console.error('[ARVON] Groq STT Error:', e);
            ws.send(JSON.stringify({ type: 'transcribe_result', requestId: reqId, payload: { text: '' } }));
          });
        } else {
           ws.send(JSON.stringify({ type: 'transcribe_result', requestId: reqId, payload: { text: '' } }));
        }
      } else {
        // Fallback to legacy VoiceEngine for everything else (ping, voice_command, legacy ai_request)
        await voiceEngine.handleMessage(ws, message);
      }
    } catch (err) {
      console.error(`[ARVON] Error parsing message:`, err);
      const errorResponse: ErrorMessage = {
        type: 'error',
        payload: { error: 'Invalid JSON or malformed message' }
      };
      ws.send(JSON.stringify(errorResponse));
    }
  });

  ws.on('close', () => {
    console.log('[ARVON] Client disconnected');
  });
  
  ws.on('error', (error) => {
    console.error(`[ARVON] WebSocket Error:`, error);
  });
});
