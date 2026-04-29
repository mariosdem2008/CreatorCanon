/**
 * Apply a fixed map of {pattern: replacement} substitutions to a string.
 * Patterns are interpreted as regex sources with implicit `\b` boundaries
 * and the global flag. The default map covers Whisper transcription errors
 * we've observed in real corpora.
 *
 * Why a sanitizer at all: Whisper occasionally hallucinates phonetic
 * approximations ("Chat2BT" for "ChatGPT") that get lifted into the
 * channel's `creatorTerminology` and into source-moment excerpts. We keep
 * `segment.text` raw in the DB (one source of truth for the transcript)
 * and clean only at read paths: agent prompt builders + manifest projection.
 *
 * Add new entries here only when you've actually observed the error in
 * production transcripts. Do NOT pre-emptively add "common Whisper errors
 * from a blog post" — false positives cost more than the occasional miss.
 */
export const DEFAULT_SUBSTITUTIONS: Record<string, string> = {
  // Whisper consistently hears "ChatGPT" as "Chat2BT" on certain accents.
  'Chat2BT': 'ChatGPT',
};

export function sanitizeTranscriptText(text: string, substitutions: Record<string, string>): string {
  if (!text) return text;
  let out = text;
  for (const [pattern, replacement] of Object.entries(substitutions)) {
    // \b boundaries prevent embedding-in-other-words false positives.
    // Each iteration mutates `out`, so chained substitutions compose.
    const re = new RegExp(`\\b${pattern}\\b`, 'g');
    out = out.replace(re, replacement);
  }
  return out;
}
