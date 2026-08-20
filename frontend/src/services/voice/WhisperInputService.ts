import { IVoiceInputService } from './types';
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';
import { encodeWAV } from './audioUtils';
import { wsService } from '../websocket';

// Configure transformers.js to not use local file system for models
// so it works cleanly in Electron/Vite without native fs bindings
env.allowLocalModels = false;
env.useBrowserCache = true;

export class WhisperInputService implements IVoiceInputService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private isCurrentlyListening = false;
  private transcriber: any = null;
  private isModelLoading = false;
  
  private currentRequestId: string = '';
  private recordStartTime: number = 0;

  private finalCallback: ((text: string) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private stateCallback: ((isListening: boolean) => void) | null = null;

  constructor() {
    this.initModel();
  }

  private async initModel() {
    if (this.transcriber || this.isModelLoading) return;
    this.isModelLoading = true;
    const initStart = performance.now();
    console.log(`[WHISPER] Model loading...`);
    try {
      env.backends.onnx.wasm.numThreads = 1;
      this.transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      console.log(`[WHISPER] Model loaded in ${Math.round(performance.now() - initStart)} ms`);
    } catch (e: any) {
      console.error('[WHISPER] Failed to load model:', e);
      if (this.errorCallback) this.errorCallback(e);
    } finally {
      this.isModelLoading = false;
    }
  }

  public setRequestId(id: string) {
    this.currentRequestId = id;
  }

  public async startListening(): Promise<void> {
    if (!this.transcriber) {
      if (this.isModelLoading) {
        throw new Error('Speech Model is still downloading or loading. Try again in a few seconds.');
      } else {
        throw new Error('Speech Model failed to load.');
      }
    }

    if (this.isCurrentlyListening) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const recordDuration = performance.now() - this.recordStartTime;
        console.log(`[ARVON][${this.currentRequestId}] [VOICE] Recording stopped: ${Date.now()} ms`);
        console.log(`[ARVON][${this.currentRequestId}] [VOICE] Recording duration: ${Math.round(recordDuration)} ms`);
        
        this.isCurrentlyListening = false;
        this.notifyState();
        await this.processAudio();
        
        // Cleanup stream
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }
      };

      this.recordStartTime = performance.now();
      console.log(`[ARVON][${this.currentRequestId}] [VOICE] Recording started: ${Date.now()} ms`);
      this.mediaRecorder.start();
      this.isCurrentlyListening = true;
      this.notifyState();
    } catch (e: any) {
      console.error(`[ARVON][${this.currentRequestId}] [VOICE] Failed to start microphone:`, e);
      if (this.errorCallback) this.errorCallback(e);
      this.isCurrentlyListening = false;
      this.notifyState();
      throw e;
    }
  }

  public async stopListening(): Promise<void> {
    if (this.mediaRecorder && this.isCurrentlyListening) {
      this.mediaRecorder.stop();
    }
  }

  public isListening(): boolean {
    return this.isCurrentlyListening;
  }

  // Modified for Phase 4 to accept Float32Array from VAD
  public async processAudioBuffer(audioData: Float32Array | Blob[]): Promise<string | null> {
    if (!this.transcriber) return null;

    try {
      const sttStart = performance.now();
      console.log(`[ARVON][${this.currentRequestId}] [STT] Transcription started: ${Date.now()} ms`);
      
      let channelData: Float32Array;

      // Compatibility for legacy manual recording (Blob[]) vs VAD (Float32Array wrapped in Blob wrapper)
      if (Array.isArray(audioData)) {
        if (audioData.length > 0 && audioData[0] instanceof Blob && audioData[0].type === '') {
           // It's the Float32Array wrapped inside a Blob buffer from VAD
           channelData = new Float32Array(await audioData[0].arrayBuffer());
        } else {
           const audioBlob = new Blob(audioData, { type: 'audio/webm' });
           const arrayBuffer = await audioBlob.arrayBuffer();
           const audioContext = new window.AudioContext({ sampleRate: 16000 });
           const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
           channelData = audioBuffer.getChannelData(0);
        }
      } else {
        channelData = audioData;
      }

      const result = await this.transcriber(channelData);
      
      const sttDuration = performance.now() - sttStart;
      console.log(`[ARVON][${this.currentRequestId}] [STT] Local Transcription finished: ${Date.now()} ms`);
      console.log(`[ARVON][${this.currentRequestId}] [STT] Duration: ${Math.round(sttDuration)} ms`);
      
      let finalTranscript = result && result.text ? result.text.trim() : null;

      // Now we try Groq API over WebSocket as a preferred remote STT
      try {
        console.log(`[ARVON][${this.currentRequestId}] [STT] Attempting Groq Whisper...`);
        const wavBlob = encodeWAV(channelData);
        const arrayBuffer = await wavBlob.arrayBuffer();
        const base64Data = btoa(
            new Uint8Array(arrayBuffer)
                .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        const reqId = this.currentRequestId || `REQ-${Date.now()}`;
        const transcriptionPromise = new Promise<string>((resolve) => {
           const unsub = wsService.onMessage((msg) => {
              if (msg.type === 'transcribe_result' && msg.requestId === reqId) {
                 unsub();
                 resolve(msg.payload.text);
              }
           });
           
           // Set a timeout of 5 seconds for remote transcription
           setTimeout(() => {
              unsub();
              resolve(''); // fallback to local
           }, 5000);
        });

        wsService.send({
           type: 'transcribe_audio',
           requestId: reqId,
           payload: { audioData: base64Data }
        } as any);

        const remoteTranscript = await transcriptionPromise;
        if (remoteTranscript && remoteTranscript.trim().length > 0) {
            console.log(`[ARVON][${reqId}] [STT] Remote Groq transcript won: "${remoteTranscript}"`);
            finalTranscript = remoteTranscript.trim();
        } else {
            console.log(`[ARVON][${reqId}] [STT] Remote Groq transcript failed or empty. Falling back to local.`);
        }
      } catch (e) {
         console.error(`[ARVON][${this.currentRequestId}] [STT] Groq remote failed:`, e);
      }

      if (finalTranscript) {
        if (this.finalCallback && finalTranscript.length > 0) {
          this.finalCallback(finalTranscript);
        }
        return finalTranscript;
      }
      return null;
    } catch (e: any) {
      console.error(`[ARVON][${this.currentRequestId}] [STT] Processing error:`, e);
      if (this.errorCallback) this.errorCallback(e);
      return null;
    }
  }

  // Legacy processor for manual talk button
  private async processAudio() {
    if (this.audioChunks.length === 0) return;
    await this.processAudioBuffer(this.audioChunks);
  }

  public onPartialTranscript(_callback: (text: string) => void): void {
    // Transformers.js pipeline doesn't natively stream partials easily out of the box in this basic setup
    // We only provide the final transcript for now.
  }

  public onFinalTranscript(callback: (text: string) => void): void {
    this.finalCallback = callback;
  }

  public onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  public onStateChange(callback: (isListening: boolean) => void): void {
    this.stateCallback = callback;
  }

  private notifyState() {
    if (this.stateCallback) {
      this.stateCallback(this.isCurrentlyListening);
    }
  }
}
