import { IVoiceActivityService } from './types';

export class VoiceActivityService implements IVoiceActivityService {
  private myvad: any = null;
  private isEngineRunning = false;
  private isPaused = true;
  
  private speechStartCallback: (() => void) | null = null;
  private speechEndCallback: ((audioBuffer: Float32Array) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;

  public async start(stream?: MediaStream): Promise<void> {
    if (this.isEngineRunning) return;

    try {
      console.log('[VAD] Initializing Voice Activity Detection...');
      
      const _ort = (window as any).ort;
      const _vad = (window as any).vad;
      
      if (!_ort || !_vad) {
        throw new Error('VAD libraries not loaded from CDN.');
      }

      _ort.env.wasm.numThreads = 1;
      _ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';
      
      this.myvad = await _vad.MicVAD.new({
        stream: stream, // Provide shared stream
        preSpeechPadFrames: 5,
        minSpeechFrames: 3,
        // The silence timeout
        redemptionFrames: 30, // Approx 1 second of silence (depends on frame rate)
        onSpeechStart: () => {
          if (this.isPaused) return;
          console.log('[VAD] Speech started');
          if (this.speechStartCallback) this.speechStartCallback();
        },
        onSpeechEnd: (audio: Float32Array) => {
          if (this.isPaused) return;
          console.log('[VAD] Speech ended');
          if (this.speechEndCallback) {
            this.speechEndCallback(audio);
          }
        }
      });
      
      this.isEngineRunning = true;
      console.log('[VAD] Engine ready.');
      
      // Start it internally, but respect our pause state
      await this.myvad.start();
    } catch (e: any) {
      console.error('[VAD] Engine failed to start:', e);
      if (this.errorCallback) this.errorCallback(e);
      throw e;
    }
  }

  public async stop(): Promise<void> {
    if (this.myvad) {
      this.myvad.pause();
      this.myvad = null;
    }
    this.isEngineRunning = false;
  }

  public pause(): void {
    this.isPaused = true;
    console.log('[VAD] Paused.');
  }

  public resume(): void {
    this.isPaused = false;
    console.log('[VAD] Resumed.');
  }

  public onSpeechStart(callback: () => void): void {
    this.speechStartCallback = callback;
  }

  public onSpeechEnd(callback: (audioBuffer: Float32Array) => void): void {
    this.speechEndCallback = callback;
  }

  public onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }
}
