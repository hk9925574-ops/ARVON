import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export class PiperTTS {
  private piperExecutable: string;
  private modelPath: string;
  private piperProcess: ChildProcess | null = null;
  private isReady = false;

  constructor() {
    // Relative to backend root
    const piperDir = path.join(process.cwd(), 'piper_tts', 'piper');
    this.piperExecutable = path.join(piperDir, 'piper.exe');
    this.modelPath = path.join(piperDir, 'en_US-lessac-medium.onnx');
    this.startDaemon();
  }

  private startDaemon() {
    console.log(`[ARVON][TTS] Starting Piper daemon...`);
    
    this.piperProcess = spawn(this.piperExecutable, [
      '--model', this.modelPath,
      '--output_raw'
    ]);

    this.piperProcess.stdout?.on('data', (data) => {
       if (this.currentStreamCallback) {
           this.currentStreamCallback(data);
       }
    });

    this.piperProcess.stderr?.on('data', (data) => {
       // Piper logs some info to stderr, just ignore or debug log
    });

    this.piperProcess.on('close', (code) => {
       console.log(`[ARVON][TTS] Piper daemon exited with code ${code}. Restarting...`);
       this.isReady = false;
       this.piperProcess = null;
       setTimeout(() => this.startDaemon(), 1000);
    });

    this.isReady = true;
  }

  private currentStreamCallback: ((chunk: Buffer) => void) | null = null;

  /**
   * Generates a TTS audio file
   */
  public generateAudio(text: string, outputFilePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      
      const piperProcess = spawn(this.piperExecutable, [
        '--model', this.modelPath,
        '--output_file', outputFilePath
      ]);

      // Write text to stdin
      piperProcess.stdin.write(text);
      piperProcess.stdin.end();

      piperProcess.on('close', (code) => {
        console.log(`[PERF] TTS Generation: ${Math.round(performance.now() - startTime)}ms`);
        if (code === 0) {
          // Play the audio on Windows using PowerShell SoundPlayer
          const playProcess = spawn('powershell', [
            '-c', `(New-Object Media.SoundPlayer '${outputFilePath}').PlaySync()`
          ]);
          
          playProcess.on('close', () => resolve());
          playProcess.on('error', (err) => resolve());
        } else {
          console.error(`[ARVON][TTS] Piper process exited with code ${code}`);
          reject(new Error(`Piper TTS failed with exit code ${code}`));
        }
      });
    });
  }

  public generateAudioStream(text: string, onData: (chunk: Buffer) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.piperProcess || !this.isReady) {
         return reject(new Error('Piper daemon not ready'));
      }
      
      this.currentStreamCallback = onData;
      
      // Piper generates TTS per line. We ensure there is a newline so it processes it immediately.
      this.piperProcess.stdin?.write(text.trim() + '\n');
      
      // Since it's continuous, we don't know exactly when it finishes a chunk via raw stdout easily,
      // but Piper flushes stdout when done with a line. 
      // To simulate "done" for the promise, we can just resolve immediately or wait a bit.
      // Resolving immediately is fine for streaming, as long as audio gets pumped to websocket.
      resolve();
    });
  }
}
