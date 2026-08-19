import { getAudioContext } from "../shared/audio/audioStore";

export interface WaveformPeak {
  min: number;
  max: number;
}

const cache = new Map<string, Promise<WaveformPeak[] | null>>();

/**
 * Decodes an audio blob URL once and downsamples its channel data into min/max
 * peaks (the classic waveform look). Cached per URL so the timeline only
 * decodes each track a single time.
 */
export function loadWaveformPeaks(url: string, buckets = 320): Promise<WaveformPeak[] | null> {
  const cached = cache.get(url);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return null;
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const audio = await ctx.decodeAudioData(buf);
      const data = audio.getChannelData(0);
      const peaks: WaveformPeak[] = [];
      const step = Math.max(1, Math.floor(data.length / buckets));
      for (let i = 0; i < buckets; i++) {
        let min = 1;
        let max = -1;
        const start = i * step;
        const end = Math.min(data.length, start + step);
        for (let j = start; j < end; j++) {
          const v = data[j];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        peaks.push({ min, max });
      }
      return peaks;
    } catch {
      return null;
    }
  })();

  cache.set(url, promise);
  return promise;
}
