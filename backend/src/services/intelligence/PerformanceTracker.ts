export interface PerformanceMetrics {
  intentMs: number;
  memoryMs: number;
  webMs: number;
  aiMs: number;
  toolsMs: number;
  ttsMs: number;
  reasoningMs: number;
  totalMs: number;
}

export class PerformanceTracker {
  private startTime: number = 0;
  private phaseStarts: Map<string, number> = new Map();
  private metrics: Partial<PerformanceMetrics> = {
    intentMs: 0,
    memoryMs: 0,
    webMs: 0,
    aiMs: 0,
    toolsMs: 0,
    ttsMs: 0,
    reasoningMs: 0,
    totalMs: 0
  };

  public startRequest() {
    this.startTime = Date.now();
    this.phaseStarts.clear();
    this.metrics = {
      intentMs: 0, memoryMs: 0, webMs: 0, aiMs: 0, toolsMs: 0, ttsMs: 0, reasoningMs: 0, totalMs: 0
    };
  }

  public startPhase(phase: keyof PerformanceMetrics) {
    this.phaseStarts.set(phase, Date.now());
  }

  public endPhase(phase: keyof PerformanceMetrics) {
    const start = this.phaseStarts.get(phase);
    if (start) {
      this.metrics[phase] = (this.metrics[phase] || 0) + (Date.now() - start);
    }
  }

  public getMetrics(): PerformanceMetrics {
    this.metrics.totalMs = Date.now() - this.startTime;
    return this.metrics as PerformanceMetrics;
  }
}
