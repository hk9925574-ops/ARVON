import * as say from 'say';

export interface SpeechResult {
  spoke: boolean;
  reason?: string;
  error?: any;
}

export class SpeechOutputEngine {
  private enabled: boolean;
  public voice: string | null = null;
  public speed: number = 1.0;
  public broadcastAudio: ((chunk: Buffer) => void) | null = null;
  private speaking: boolean;

  constructor({ enabled = false, voice = null, speed = 1.0 }: { enabled?: boolean, voice?: string | null, speed?: number } = {}) {
    this.enabled = enabled;
    this.voice = voice;
    this.speed = speed;
    this.speaking = false;
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    console.log(`[SPEECH] enabled set to ${value}`);
  }

  /**
   * Speak the given text. Never throws — always resolves.
   * Failures are logged only, never surfaced raw to the user.
   */
  async speak(text: string, t0?: number): Promise<SpeechResult> {
    if (!this.enabled) {
      console.log("[SPEECH] skipped — speech output disabled");
      return { spoke: false, reason: "disabled" };
    }
    if (!text || !text.trim()) {
      console.log("[SPEECH] skipped — empty text");
      return { spoke: false, reason: "empty_text" };
    }

    // Strip out markdown for speech
    const cleanText = text.replace(/```[\s\S]*?```/g, "Code block omitted.")
                          .replace(/[*_#`]/g, "")
                          .replace(/'/g, "''"); // escape single quotes for powershell

    console.log("[SPEECH] attempting synthesis:", cleanText.slice(0, 60));
    this.speaking = true;

    return new Promise((resolve) => {
      if (this.broadcastAudio) {
          // Stream via Piper (Singleton)
          if (!(global as any)._piperInstance) {
              const PiperTTS = require('../voice/PiperTTS').PiperTTS;
              (global as any)._piperInstance = new PiperTTS();
          }
          const piper = (global as any)._piperInstance;
          piper.generateAudioStream(cleanText, (chunk: Buffer) => {
              this.broadcastAudio!(chunk);
          }).then(() => resolve({ spoke: true })).catch((err: any) => resolve({ spoke: false, reason: "tts_error", error: err }));
      } else {
          // Fallback to powershell
          let voiceCmd = '';
          if (this.voice) {
              voiceCmd = `try { $speak.SelectVoice('${this.voice}') } catch {}`;
          } else {
              voiceCmd = `try { $speak.SelectVoice('Microsoft Zira Desktop') } catch {}`;
          }

          const psCommand = `Add-Type -AssemblyName System.speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${voiceCmd}; $speak.Rate = ${Math.floor((this.speed - 1) * 10)}; $speak.Speak('${cleanText}')`;
          
          const { spawn } = require('child_process');
          const child = spawn('powershell.exe', ['-Command', psCommand]);
          this.activeChild = child;

          let firstAudioLogged = false;
          child.stdout.on('data', () => {
             if (!firstAudioLogged && t0) {
                 console.log(`[PERF] tts_first_audio: ${Date.now() - t0}ms`);
                 firstAudioLogged = true;
             }
          });
          child.stderr.on('data', () => {
             if (!firstAudioLogged && t0) {
                 console.log(`[PERF] tts_first_audio: ${Date.now() - t0}ms`);
                 firstAudioLogged = true;
             }
          });

          child.on('error', (err: any) => {
            this.speaking = false;
            this.activeChild = null;
            console.error("[SPEECH] synthesis failed:", err.message || err);
            resolve({ spoke: false, reason: "tts_error", error: err });
          });

          child.on('close', (code: number) => {
            this.speaking = false;
            this.activeChild = null;
            if (code !== 0) {
              console.error(`[SPEECH] synthesis exited with code ${code}`);
              resolve({ spoke: false, reason: "tts_error", error: `exit code ${code}` });
            } else {
              console.log("[SPEECH] synthesis complete");
              resolve({ spoke: true });
            }
          });
      }
    });
  }

  private activeChild: any | null = null;

  stop() {
    if (this.speaking) {
      if (this.activeChild) {
        try {
          this.activeChild.kill();
        } catch (e) {
          // ignore
        }
        this.activeChild = null;
      }
      this.speaking = false;
      console.log("[SPEECH] stopped mid-utterance");
    }
  }
}
