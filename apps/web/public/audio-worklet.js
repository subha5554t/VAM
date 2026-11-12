/**
 * AudioWorkletProcessor that downsamples microphone input to 16 kHz PCM 16-bit mono.
 * Emits ~40 ms chunks (640 samples) to the main thread for Gemini Live API streaming.
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.sampleRateRatio = sampleRate / 16000;
    this.accumulator = 0;
    this.sum = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];

    // Downsample to 16 kHz using boxcar averaging
    for (let i = 0; i < channelData.length; i++) {
      this.sum += channelData[i];
      this.accumulator += 1;

      if (this.accumulator >= this.sampleRateRatio) {
        const averagedSample = this.sum / this.accumulator;
        this.buffer.push(averagedSample);
        this.sum = 0;
        this.accumulator -= this.sampleRateRatio;
      }
    }

    // When we accumulate 640 samples (~40 ms @ 16 kHz), convert to Int16 PCM and emit
    const FRAME_SIZE = 640;
    while (this.buffer.length >= FRAME_SIZE) {
      const frameSamples = this.buffer.splice(0, FRAME_SIZE);
      const int16Buffer = new Int16Array(FRAME_SIZE);

      for (let i = 0; i < FRAME_SIZE; i++) {
        // Clamp sample to [-1, 1] and scale to 16-bit signed integer range [-32768, 32767]
        const s = Math.max(-1, Math.min(1, frameSamples[i]));
        int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      this.port.postMessage(int16Buffer.buffer, [int16Buffer.buffer]);
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PCMCaptureProcessor);

