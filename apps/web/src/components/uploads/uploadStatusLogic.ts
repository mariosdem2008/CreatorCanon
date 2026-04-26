/** Pure logic for resolving upload+transcribe status to a display label and tone.
 *  No React/Next.js/@ imports — safe to import from node:test files.
 */

export interface Props {
  uploadStatus: 'uploading' | 'uploaded' | 'failed' | null;
  transcribeStatus: 'pending' | 'transcribing' | 'ready' | 'failed' | null;
}

type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent';

export interface Resolved {
  label: string;
  tone: Tone;
}

export function resolveStatus(props: Props): Resolved {
  const { uploadStatus, transcribeStatus } = props;

  if (uploadStatus === 'uploading') return { label: 'Uploading', tone: 'info' };
  if (uploadStatus === 'failed') return { label: 'Upload failed', tone: 'danger' };
  if (transcribeStatus === 'transcribing') return { label: 'Transcribing', tone: 'accent' };
  if (transcribeStatus === 'failed') return { label: 'Transcription failed', tone: 'danger' };
  if (transcribeStatus === 'ready') return { label: 'Ready', tone: 'success' };
  return { label: 'Pending', tone: 'neutral' };
}
