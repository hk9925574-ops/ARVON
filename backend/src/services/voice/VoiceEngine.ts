import * as WebSocket from 'ws';
import { ClientMessage, PongMessage, AIResponseMessage, ErrorMessage } from '../../../../shared/types';
import { IntentRouter } from '../intent/IntentRouter';
import { PiperTTS } from './PiperTTS';

export class VoiceEngine {
  private intentRouter: IntentRouter;
  private ttsEngine: PiperTTS;

  constructor(intentRouter: IntentRouter, ttsEngine: PiperTTS) {
    this.intentRouter = intentRouter;
    this.ttsEngine = ttsEngine;
  }

  public async handleMessage(ws: WebSocket, message: ClientMessage) {
    try {
      if (message.type === 'ping') {
        const response: PongMessage = {
          type: 'pong',
          requestId: message.requestId,
          payload: { message: 'ARVON backend received your message' }
        };
        ws.send(JSON.stringify(response));
        console.log(`[ARVON] Sent response: pong`);
      } else if (message.type === 'ai_request') {
        await this.handleAIRequest(ws, message);
      } else if (message.type === 'voice_command') {
        await this.handleLegacyVoiceCommand(ws, message);
      } else {
        console.log(`[ARVON] Warning: Unhandled message type: ${(message as any).type}`);
      }
    } catch (err) {
      console.error(`[ARVON] Error handling message:`, err);
      const errorResponse: ErrorMessage = {
        type: 'error',
        payload: { error: 'Internal VoiceEngine Error' }
      };
      ws.send(JSON.stringify(errorResponse));
    }
  }

  private async handleAIRequest(ws: WebSocket, message: any) {
    const text = (message.payload.text || '').trim();
    const reqId = message.requestId || `REQ-${Math.floor(Math.random()*10000)}`;
    
    const startTime = performance.now();
    console.log(`\n==================================================`);
    console.log(`[ARVON][${reqId}] VoiceEngine processing started`);
    
    const replyText = await this.intentRouter.routeRequest(text, reqId);
    console.log(`[ARVON][${reqId}] VoiceEngine routing duration: ${Math.round(performance.now() - startTime)} ms`);

    const outputFilePath = `response_${reqId}.wav`;
    this.ttsEngine.generateAudio(replyText, outputFilePath).catch((e: any) => console.error(e));

    const response: AIResponseMessage = {
      type: 'ai_response',
      requestId: reqId,
      payload: { text: replyText }
    };
    ws.send(JSON.stringify(response));
    console.log(`[ARVON][${reqId}] [WS] Response sent: ${replyText.substring(0, 50)}...`);
  }

  private async handleLegacyVoiceCommand(ws: WebSocket, message: any) {
    const text = (message.payload.text || '').toLowerCase().trim();
    let reply = "I heard you, but advanced AI responses are not enabled yet.";
    if (text === 'hello arvon') reply = "Hello Jb. I'm ready.";
    else if (text === 'what is your name') reply = "I'm ARVON, your desktop AI assistant.";
    else if (text === 'are you there') reply = "Yes. I'm listening.";

    const response = {
      type: 'voice_response',
      requestId: message.requestId,
      payload: { text: reply }
    };
    ws.send(JSON.stringify(response));
  }
}
