import { EventEmitter } from 'events';

/**
 * Latency-only health score for the active node.
 *
 * The score is an EWMA of per-sample quality in 0-100 where 100 is a perfect
 * 1 ms round trip and 0 is a dead endpoint. Using an EWMA instead of the last
 * sample keeps a single spike from flapping the connection to another server —
 * the whole point of auto-switching is to react to a trend, not to noise.
 */
export const HEALTH_ALPHA = 0.25;
export const HEALTH_BAD_THRESHOLD = 35;
export const HEALTH_SWITCH_AFTER_BAD_SAMPLES = 3;

export interface HealthSample {
  /** Round-trip time in ms; a negative value means the endpoint did not answer. */
  pingMs: number;
}

/** Maps a round-trip time to a 0-100 quality value. */
export function pingToQuality(pingMs: number): number {
  if (!Number.isFinite(pingMs) || pingMs < 0) return 0;
  if (pingMs <= 50) return 100;
  if (pingMs >= 1000) return 0;
  // Linear decay between 50 ms and 1000 ms.
  return Math.round(100 - ((pingMs - 50) / 950) * 100);
}

export class HealthMonitor extends EventEmitter {
  private score: number | null = null;
  private consecutiveBad = 0;

  public getScore(): number | undefined {
    return this.score === null ? undefined : Math.round(this.score);
  }

  public getConsecutiveBadSamples(): number {
    return this.consecutiveBad;
  }

  public reset(): void {
    this.score = null;
    this.consecutiveBad = 0;
  }

  /**
   * Feeds one measurement in. Returns true once the node has been unhealthy for
   * HEALTH_SWITCH_AFTER_BAD_SAMPLES consecutive samples, which is the caller's
   * signal to look for a better server. The counter resets on a healthy sample
   * so a node that recovers is not switched away from.
   */
  public record(sample: HealthSample): boolean {
    const quality = pingToQuality(sample.pingMs);
    this.score = this.score === null ? quality : HEALTH_ALPHA * quality + (1 - HEALTH_ALPHA) * this.score;

    if (this.score < HEALTH_BAD_THRESHOLD) {
      this.consecutiveBad += 1;
    } else {
      this.consecutiveBad = 0;
    }

    this.emit('health', this.getScore());
    return this.consecutiveBad >= HEALTH_SWITCH_AFTER_BAD_SAMPLES;
  }
}
