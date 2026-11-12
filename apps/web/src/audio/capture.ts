/**
 * AudioCapture: captures microphone audio, resamples to 16 kHz 16-bit PCM mono,
 * and emits frames to the Live session with zero garbage collection pauses.
 */

export interface CaptureDiagnostics {
  rms: number;
  sampleRate: number;
  deviceLabel: string;
  deviceId: string;
  trackState: string;
  /** True when the OS/Chrome has muted the track itself. */
  trackMuted: boolean;
  isCapturing: boolean;
}

/** A raw input measurement taken outside the Live capture graph. */
export interface InputProbe {
  deviceId: string;
  label: string;
  /** Peak absolute sample level over the probe window (0..1). */
  peakLevel: number;
  sampleRate: number;
  /** True when AEC/NS/AGC were explicitly disabled for this probe. */
  relaxed: boolean;
  muted: boolean;
  error?: string;
}

/**
 * Below this peak level a stream is treated as silent. A healthy mic always
 * has some noise floor, so a value of exactly ~0 means the device/OS is
 * delivering zeros rather than a quiet room.
 */
export const MIC_SIGNAL_THRESHOLD = 0.001;

const PROBE_DURATION_MS = 1200;

export interface CaptureOptions {
  /** Exact input device chosen by the seller. Falls back to the system default. */
  deviceId?: string;
  /**
   * Relaxed mode disables browser audio processing (AEC/NS/AGC). Some Windows
   * microphone arrays return all-zero samples with processing enabled.
   */
  relaxed?: boolean;
}

/**
 * Resamples arbitrary-rate Float32 audio to 16 kHz Int16 PCM.
 *
 * Uses a box (moving-average) decimation instead of nearest-neighbour sampling:
 * naive point sampling from 48 kHz aliases everything above 8 kHz back into the
 * speech band, which measurably degrades Gemini's transcription accuracy.
 */
export function downsampleTo16k(input: Float32Array, inputSampleRate: number): Int16Array {
  const ratio = inputSampleRate / 16000;

  if (ratio <= 1) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  const newLength = Math.floor(input.length / ratio);
  const output = new Int16Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const start = i * ratio;
    const end = start + ratio;
    const from = Math.floor(start);
    const to = Math.min(Math.ceil(end), input.length);

    let sum = 0;
    let count = 0;
    for (let j = from; j < to; j++) {
      sum += input[j];
      count++;
    }

    const s = count > 0 ? Math.max(-1, Math.min(1, sum / count)) : 0;
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return output;
}

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private muteGain: GainNode | null = null;
  private isCapturing: boolean = false;
  private sampleRate: number = 0;
  private deviceLabel: string = 'unknown';
  private deviceId: string = '';
  private lastRms: number = 0;

  async start(
    onFrame: (pcmBuffer: ArrayBuffer) => void,
    onVolume?: (volume: number) => void,
    onDiagnostics?: (d: CaptureDiagnostics) => void,
    options: CaptureOptions = {}
  ): Promise<void> {
    if (this.isCapturing) return;

    try {
      // Keep the device's native rate. Forcing a 16 kHz AudioContext makes
      // some Windows arrays (notably Intel Smart Sound) deliver silent buffers
      // even though the track reports "live". The resampler below handles any
      // hardware rate, so there is no reason to force one.
      //
      // Default mode deliberately sends *only* the device id. On some Windows
      // APO/driver combinations the presence of channelCount/AEC/NS/AGC
      // constraints (even `false`) is enough to make Chrome return all-zero
      // samples. Relaxed mode explicitly disables processing for devices that
      // default to it.
      const constraints: MediaTrackConstraints = {};
      if (options.relaxed) {
        constraints.echoCancellation = false;
        constraints.noiseSuppression = false;
        constraints.autoGainControl = false;
      }
      if (options.deviceId) constraints.deviceId = { exact: options.deviceId };

      const openMicrophone = () =>
        navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });

      try {
        this.mediaStream = await openMicrophone();
      } catch (err) {
        // A saved device can disappear between calls. Retry the default input
        // instead of leaving the seller with a dead call.
        if (!options.deviceId) throw err;
        console.warn(
          `[AudioCapture] Selected mic ${options.deviceId} unavailable; falling back to the system default.`,
          err
        );
        delete constraints.deviceId;
        this.mediaStream = await openMicrophone();
      }

      const AudioContextCtor =
        window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextCtor();
      this.sampleRate = this.audioContext.sampleRate;

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Buffer size 1024: ~21ms @ 48kHz, ~64ms @ 16kHz. Smaller frames cut
      // VAD onset latency without flooding the socket.
      const bufferSize = 1024;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!this.isCapturing) return;

        const inputChannel = e.inputBuffer.getChannelData(0);
        const pcmInt16 = downsampleTo16k(inputChannel, this.sampleRate);

        if (pcmInt16.length === 0) return;

        onFrame(pcmInt16.buffer as ArrayBuffer);

        if (onVolume || onDiagnostics) {
          let sumSquares = 0;
          for (let i = 0; i < inputChannel.length; i++) {
            sumSquares += inputChannel[i] * inputChannel[i];
          }
          const rms = Math.sqrt(sumSquares / inputChannel.length);
          this.lastRms = rms;

          if (onVolume) onVolume(Math.min(1, rms * 6));

          if (onDiagnostics) {
            onDiagnostics({
              rms,
              sampleRate: this.sampleRate,
              deviceLabel: this.deviceLabel,
              deviceId: this.deviceId,
              trackState: this.mediaStream?.getAudioTracks()[0]?.readyState ?? 'ended',
              trackMuted: this.mediaStream?.getAudioTracks()[0]?.muted ?? false,
              isCapturing: this.isCapturing,
            });
          }
        }
      };

      // Connect source -> processor -> muteGain(0) -> destination
      // The gain(0) keeps the browser's audio clock ticking with no feedback loop.
      this.muteGain = this.audioContext.createGain();
      this.muteGain.gain.value = 0;

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.muteGain);
      this.muteGain.connect(this.audioContext.destination);

      const track = this.mediaStream.getAudioTracks()[0];
      this.deviceLabel = track?.label || 'default microphone';
      this.deviceId = track?.getSettings().deviceId || '';
      this.isCapturing = true;
      console.log(
        `[AudioCapture] Mic "${this.deviceLabel}" started at ${this.sampleRate}Hz (` +
          `${this.sampleRate === 16000 ? 'native 16kHz' : 'resampling to 16kHz Int16 PCM'}, ` +
          `processing=${options.relaxed ? 'off' : 'browser-default'})`
      );
      // Evidence for the "live track but silent samples" class of failure:
      // the negotiated rate/channels and whether the OS itself muted the track.
      console.log('[AudioCapture] Track settings', {
        label: this.deviceLabel,
        muted: track?.muted ?? false,
        settings: track?.getSettings?.() ?? {},
        capabilities: (track as any)?.getCapabilities?.() ?? {},
      });
    } catch (err) {
      this.stop();
      throw err;
    }
  }

  getDiagnostics(): CaptureDiagnostics {
    return {
      rms: this.lastRms,
      sampleRate: this.sampleRate,
      deviceLabel: this.deviceLabel,
      deviceId: this.deviceId,
      trackState: this.mediaStream?.getAudioTracks()[0]?.readyState ?? 'ended',
      trackMuted: this.mediaStream?.getAudioTracks()[0]?.muted ?? false,
      isCapturing: this.isCapturing,
    };
  }

  stop(): void {
    this.isCapturing = false;

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }

    if (this.muteGain) {
      try {
        this.muteGain.disconnect();
      } catch {}
      this.muteGain = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.mediaStream = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    console.log('[AudioCapture] Mic capture stopped.');
  }

  isActive(): boolean {
    return this.isCapturing;
  }
}

/** Chooses the loudest probe that actually carried signal. Pure for tests. */
export function pickBestInput(probes: InputProbe[]): InputProbe | null {
  const working = probes
    .filter((probe) => !probe.error && probe.peakLevel >= MIC_SIGNAL_THRESHOLD)
    .sort((a, b) => b.peakLevel - a.peakLevel);
  return working[0] ?? null;
}

/**
 * Measures every audio input directly through an AnalyserNode, outside the
 * ScriptProcessor/resampler path. This is the recovery path for the failure
 * where Chrome exposes a live track for the selected (often "Communications")
 * endpoint but delivers all-zero samples:
 *
 * - the system default is tested as its own target (it is not the same thing
 *   as an enumerated device id),
 * - each device is first tested with browser-default processing,
 * - if that is silent, it is retested with AEC/NS/AGC disabled,
 * - each result carries the peak level, so the UI can switch to the input that
 *   actually works instead of asking the seller to guess.
 */
export async function probeInputs(durationMs = PROBE_DURATION_MS): Promise<InputProbe[]> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone API unavailable (requires HTTPS or localhost).');
  }

  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    (device) => device.kind === 'audioinput'
  );
  const targets = [
    { deviceId: '', label: 'System default' },
    ...devices.map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Microphone ${index + 1}`,
    })),
  ];

  const seen = new Set<string>();
  const results: InputProbe[] = [];

  for (const target of targets) {
    if (seen.has(target.deviceId)) continue;
    seen.add(target.deviceId);

    for (const relaxed of [false, true]) {
      const probe = await probeOne(target.deviceId, relaxed, target.label, durationMs);
      results.push(probe);
      // No point retesting a working device in the other mode.
      if (!probe.error && probe.peakLevel >= MIC_SIGNAL_THRESHOLD) break;
    }
  }

  return results;
}

async function probeOne(
  deviceId: string,
  relaxed: boolean,
  fallbackLabel: string,
  durationMs: number
): Promise<InputProbe> {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;

  try {
    const audio: MediaTrackConstraints = {};
    if (deviceId) audio.deviceId = { exact: deviceId };
    if (relaxed) {
      audio.echoCancellation = false;
      audio.noiseSuppression = false;
      audio.autoGainControl = false;
    }

    stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('No audio track returned');

    const AudioContextCtor =
      window.AudioContext || (window as any).webkitAudioContext;
    context = new AudioContextCtor();
    if (context.state === 'suspended') await context.resume();

    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    // Analyser is pulled only if the graph reaches the destination. A zero gain
    // keeps the clock running without echoing the mic to the speakers.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(analyser);
    analyser.connect(mute);
    mute.connect(context.destination);

    const buffer = new Float32Array(analyser.fftSize);
    let peak = 0;
    const startedAt = performance.now();
    while (performance.now() - startedAt < durationMs) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      analyser.getFloatTimeDomainData(buffer);
      for (let i = 0; i < buffer.length; i++) {
        const level = Math.abs(buffer[i]);
        if (level > peak) peak = level;
      }
    }

    return {
      deviceId,
      label: track.label || fallbackLabel,
      peakLevel: peak,
      sampleRate: context.sampleRate,
      relaxed,
      muted: track.muted,
    };
  } catch (err: any) {
    return {
      deviceId,
      label: fallbackLabel,
      peakLevel: 0,
      sampleRate: 0,
      relaxed,
      muted: false,
      error: err?.name || err?.message || 'Probe failed',
    };
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
    }
    if (context) {
      try {
        await context.close();
      } catch {}
    }
  }
}
