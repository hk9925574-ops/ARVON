import { wsService, ServerMessage } from '../websocket';
import { VoiceState, IVoiceInputService, IVoiceActivityService } from './types';
import { AudioCaptureService } from './AudioCaptureService';
import { VoiceActivityService } from './VoiceActivityService';
import { WhisperInputService } from './WhisperInputService';

export class VoiceActivationService {
  private state: VoiceState = VoiceState.STANDBY;
  
  private audioCapture: AudioCaptureService;
  private vadEngine: IVoiceActivityService;
  private sttEngine: IVoiceInputService;
  
  private currentRequestId: string = '';
  private stateListeners: Set<(state: VoiceState) => void> = new Set();
  private userSpeechListeners: Set<(text: string) => void> = new Set();
  private probabilityListeners: Set<(prob: number) => void> = new Set();
  private wsUnsubscribe: (() => void) | null = null;

  constructor() {
    this.audioCapture = new AudioCaptureService();
    this.vadEngine = new VoiceActivityService();
    this.sttEngine = new WhisperInputService();
  }

  public async initialize() {
    console.log('[VoiceActivation] Initializing pipeline...');
    try {
      const stream = await this.audioCapture.initialize();
      await this.vadEngine.start(stream);
      this.setupListeners();
      this.transitionTo(VoiceState.STANDBY);
      
      // We start VAD immediately. It listens for ANY speech to act as the wake gate.
      this.vadEngine.resume();
      console.log('[VoiceActivation] Ready. VAD is listening for "ARVON".');
    } catch (e) {
      console.error('[VoiceActivation] Initialization failed:', e);
      this.transitionTo(VoiceState.ERROR);
    }
  }

  private setupListeners() {
    this.vadEngine.onSpeechStart(() => {
       // Optional: Could indicate "Hearing something..." but keeping UI stable is better
    });

    if (this.vadEngine.onProbability) {
       this.vadEngine.onProbability((prob: number) => {
           this.probabilityListeners.forEach(listener => listener(prob));
       });
    }

    this.vadEngine.onSpeechEnd(async (audioBuffer) => {
      // Pause VAD while Whisper runs so we don't queue multiple recordings
      this.vadEngine.pause();

      if (this.state === VoiceState.STANDBY) {
        // --- WAKE WORD DETECTION PHASE ---
        console.log(`[ARVON] [VAD] Speech detected in STANDBY. Checking for Wake Word...`);
        
        const transcript = await this.sttEngine.processAudioBuffer(audioBuffer);
        
        if (transcript) {
          const lower = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, ''); // strip punctuation
          
          if (lower.includes('arvon')) {
            this.currentRequestId = `REQ-${crypto.randomUUID().substring(0, 8)}`;
            console.log(`\n==================================================`);
            console.log(`[ARVON][${this.currentRequestId}] Wake Word detected: "${transcript}"`);
            this.sttEngine.setRequestId(this.currentRequestId);
            
            this.transitionTo(VoiceState.WAKE_DETECTED);
            
            // Check if there's a command attached (e.g. "Hey ARVON open chrome")
            // We strip "hey arvon" or "arvon" to see what's left
            let command = lower.replace(/hey arvon/g, '').replace(/arvon/g, '').trim();
            
            if (command.length > 2) {
              // Command included! Process it immediately.
              console.log(`[ARVON][${this.currentRequestId}] Unified command found: "${command}"`);
              await this.processCommand(command);
            } else {
              // Just the wake word. Enter LISTENING state for the next sentence.
              this.transitionTo(VoiceState.LISTENING);
              this.vadEngine.resume();
            }
          } else {
            // False alarm (someone else talking). Ignore and resume VAD.
            console.log(`[ARVON] [WAKE] Ignored false trigger: "${transcript}"`);
            this.vadEngine.resume();
          }
        } else {
          // No text transcribed. Resume VAD.
          this.vadEngine.resume();
        }
      } 
      else if (this.state === VoiceState.LISTENING) {
        // --- COMMAND PHASE (Already Awake) ---
        console.log(`[ARVON][${this.currentRequestId}] [VAD] Silence detected. Processing command.`);
        this.transitionTo(VoiceState.PROCESSING);
        
        const transcript = await this.sttEngine.processAudioBuffer(audioBuffer);
        
        if (transcript) {
          await this.processCommand(transcript);
        } else {
          console.log(`[ARVON][${this.currentRequestId}] Empty transcript. Returning to STANDBY.`);
          this.returnToStandby();
        }
      }
    });

    // WebSocket Integration
    this.wsUnsubscribe = wsService.onMessage((msg: ServerMessage) => {
      if (msg.type === 'ai_response' || msg.type === 'voice_response') {
        const reqId = msg.requestId || 'UNKNOWN';
        console.log(`[ARVON][${reqId}] [WS] AI response received: ${Date.now()} ms`);
        
        // Backend handles TTS directly now! Just transition state.
        this.transitionTo(VoiceState.SPEAKING);
        
        // Simulate speaking duration or wait for a 'speaking_complete' event.
        // For zero-cost setup, we'll return to standby after a timeout for now.
        const length = msg.payload.text.length;
        const estimatedSpeakMs = Math.max(2000, length * 75); // approx 75ms per char
        
        setTimeout(() => {
          if (this.state === VoiceState.SPEAKING) {
            console.log(`[ARVON][${reqId}] [VOICE] Complete (Estimated)`);
            this.returnToStandby();
          }
        }, estimatedSpeakMs);
      }
    });
  }

  private async processCommand(text: string) {
    this.transitionTo(VoiceState.PROCESSING);
    
    // Notify UI immediately so the user doesn't feel it's stuck!
    this.userSpeechListeners.forEach(listener => listener(text));
    
    console.log(`[ARVON][${this.currentRequestId}] [WS] AI request sent: ${Date.now()} ms`);
    wsService.send({
      type: 'ai_request',
      requestId: this.currentRequestId,
      payload: { text: text }
    });
  }

  private returnToStandby() {
    this.transitionTo(VoiceState.STANDBY);
    this.vadEngine.resume(); // Resume listening for the next Wake Word!
  }

  public async startManualListening() {
    if (this.state !== VoiceState.STANDBY && this.state !== VoiceState.ERROR) {
      return;
    }
    
    this.currentRequestId = `REQ-${crypto.randomUUID().substring(0, 8)}`;
    this.sttEngine.setRequestId(this.currentRequestId);
    
    console.log(`\n==================================================`);
    console.log(`[ARVON][${this.currentRequestId}] Manual listening triggered.`);
    
    this.transitionTo(VoiceState.LISTENING);
    
    this.vadEngine.resume();
  }

  public async stop() {
    this.vadEngine.pause();
    await this.sttEngine.stopListening();
    this.returnToStandby();
  }

  public onStateChange(callback: (state: VoiceState) => void) {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  public onUserSpeech(callback: (text: string) => void) {
    this.userSpeechListeners.add(callback);
    return () => this.userSpeechListeners.delete(callback);
  }

  public onProbability(callback: (prob: number) => void) {
    this.probabilityListeners.add(callback);
    return () => this.probabilityListeners.delete(callback);
  }

  private transitionTo(newState: VoiceState) {
    if (this.state !== newState) {
      this.state = newState;
      this.stateListeners.forEach(listener => listener(this.state));
    }
  }

  public destroy() {
    this.stop();
    this.audioCapture.release();
    this.vadEngine.stop();
    if (this.wsUnsubscribe) this.wsUnsubscribe();
  }
}

export const voiceActivationService = new VoiceActivationService();
