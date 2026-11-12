/**
 * Pure transcript helpers for the live call transcript.
 *
 * Gemini Live streams transcription as fragments and occasionally leaks stage
 * directions ("<no speech>", "{pause}") into output transcription. Anything the
 * seller reads on screen must be clean, speakable text with correct spacing.
 */

const TRANSCRIPT_ARTIFACTS = [
  /<no speech>/gi,
  /\{pause\}/gi,
  /<pause>/gi,
  /\[pause\]/gi,
  /<silence>/gi,
  /\{silence\}/gi,
];

export function sanitizeTranscript(raw: string): string {
  let out = raw;
  for (const re of TRANSCRIPT_ARTIFACTS) out = out.replace(re, ' ');
  return out
    // Strip control + zero-width characters that break screen readers.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B\u200E\u200F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Appends a streamed fragment without ever producing doubled or missing spaces
 * and without gluing punctuation onto the previous word.
 */
export function appendFragment(previous: string, next: string): string {
  if (!previous) return next;
  if (!next) return previous;
  const needsSpace = !/\s$/.test(previous) && !/^[\s.,;:!?%)\]]/.test(next);
  return needsSpace ? `${previous} ${next}` : `${previous}${next}`;
}
