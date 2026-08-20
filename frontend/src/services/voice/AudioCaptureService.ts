export class AudioCaptureService {
  private stream: MediaStream | null = null;

  public async initialize(): Promise<MediaStream> {
    if (this.stream) return this.stream;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      return this.stream;
    } catch (e) {
      console.error('[AudioCapture] Failed to initialize microphone:', e);
      throw e;
    }
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  public release() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
}
