/**
 * Shared Codex CLI runner for v2 audit pipeline body-writing utilities
 * (per-video-weaving, canon-body-writer, hero-candidates).
 *
 * Existing scripts each carry their own copy of `runCodex` because of an
 * earlier tmpfile race bug. This module is the consolidated, reviewed
 * version: read tmp content BEFORE settling so the deletion of tmpDir
 * during settle doesn't cause ENOENT in the close handler.
 *
 * Use: `await runCodex(prompt, label, { timeoutMs })` returns the raw
 * Codex output text. Use `extractJsonFromCodexOutput` (existing helper)
 * to parse JSON.
 */
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export interface RunCodexOptions {
  timeoutMs?: number;
  /** Label included in error messages for debuggability. */
  label?: string;
}

const CODEX_BIN = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const CODEX_ARGS = ['exec', '--skip-git-repo-check', '-o', '<tmpfile>'];

export async function runCodex(prompt: string, options: RunCodexOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const label = options.label ?? 'codex';

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `codex-${crypto.randomUUID().slice(0, 8)}-`));
  const tmpFile = path.join(tmpDir, 'out.txt');
  const args = CODEX_ARGS.map((a) => (a === '<tmpfile>' ? tmpFile : a));

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (cb: () => void): void => {
      if (settled) return;
      settled = true;
      // Best-effort cleanup; ignore failures (tmpdir may be busy on Windows).
      fs.rm(tmpDir, { recursive: true, force: true }, () => cb());
    };

    const proc = spawn(CODEX_BIN, args, {
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: true,
    });

    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      settle(() => reject(new Error(`[${label}] codex timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    proc.on('error', (err) => {
      clearTimeout(timer);
      settle(() => reject(new Error(`[${label}] codex spawn failed: ${err.message}`)));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        settle(() => reject(new Error(`[${label}] codex exited ${code}`)));
        return;
      }
      // CRITICAL: read tmpFile content BEFORE settle (settle deletes tmpDir).
      let content: string;
      try {
        content = fs.readFileSync(tmpFile, 'utf8');
      } catch (e) {
        settle(() => reject(new Error(`[${label}] codex output not readable: ${(e as Error).message}`)));
        return;
      }
      settle(() => resolve(content));
    });

    proc.stdin?.write(prompt);
    proc.stdin?.end();
  });
}
