export enum VoiceState {
  STANDBY = 'STANDBY',
  WAKE_DETECTED = 'WAKE_DETECTED',
  LISTENING = 'LISTENING',
  PROCESSING = 'PROCESSING',
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR'
}

export interface IVoiceInputService {
  setRequestId(id: string): void;
  // In Phase 4, startListening accepts raw audio buffers rather than managing the mic directly
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  processAudioBuffer(audioChunks: Float32Array | Blob[]): Promise<string | null>;
  isListening(): boolean;
  onFinalTranscript(callback: (text: string) => void): void;
  onError(callback: (error: Error) => void): void;
  onStateChange(callback: (isListening: boolean) => void): void;
}

export interface IVoiceActivityService {
  start(stream?: MediaStream): Promise<void>;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
  onSpeechStart(callback: () => void): void;
  onSpeechEnd(callback: (audioBuffer: Float32Array) => void): void;
  onError(callback: (error: Error) => void): void;
  onProbability?(callback: (prob: number) => void): void;
}

export interface IVoiceOutputService {
  speak(text: string): Promise<void>;
  stop(): Promise<void>;
  onStart(callback: () => void): void;
  onComplete(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface IWakeWordService {
  start(): Promise<void>;
  stop(): Promise<void>;
  onWakeWordDetected(callback: () => void): void;
}
