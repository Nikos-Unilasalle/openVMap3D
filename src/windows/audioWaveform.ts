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

/**
 * Where an audio clip sits on the timeline strip, in pixels.
 *
 * The waveform is a sync reference, so it has to be laid out on the timeline's
 * own frame axis — a clip starting at frame 90 of a 300-frame animation covers
 * the last two thirds of the strip, whatever the file's length. Returns null
 * when there is nothing to draw, including the case of a clip that falls
 * entirely outside the visible range.
 */
export function clipPixelRange(
  startFrame: number,
  duration: number,
  fps: number,
  totalFrames: number,
  width: number,
): { x: number; width: number } | null {
  if (!(duration > 0) || !(fps > 0) || !(totalFrames > 0) || !(width > 0)) return null;
  const pxPerFrame = width / totalFrames;
  const clipWidth = duration * fps * pxPerFrame;
  if (!(clipWidth > 0)) return null;
  const x = startFrame * pxPerFrame;
  if (x + clipWidth < 0 || x > width) return null;
  return { x, width: clipWidth };
}
