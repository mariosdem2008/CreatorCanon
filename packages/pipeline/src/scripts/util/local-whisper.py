#!/usr/bin/env python3
"""
Local faster-whisper transcription helper. Reads an audio file path from
argv[1], emits JSON to stdout matching the OpenAI/Groq verbose_json shape:

  { "text": "...", "language": "en", "duration": 1234.5,
    "segments": [{"start": 0.0, "end": 4.2, "text": "..."}, ...] }

Used by transcribe-pending-uploads.ts when TRANSCRIBE_PROVIDER=local-whisper.

Install: pip install faster-whisper torch
GPU model selection (CUDA available on the user's NVIDIA GPU):
  - large-v3-turbo     ~6x faster than v3, near-identical quality
  - large-v3           highest quality
  - distil-large-v3    smallest + fastest, slight quality drop

Override via env: WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE.
"""
import json
import os
import sys


def _add_pip_cuda_dlls_to_path() -> None:
    """faster-whisper / CTranslate2 need cuBLAS + cuDNN DLLs on PATH on Windows.
    The pip-installed nvidia-cublas-cu12 / nvidia-cudnn-cu12 packages drop
    DLLs into site-packages/nvidia/<lib>/bin/. nvidia/ is a namespace package
    (no __init__.py, no __file__), so import-based resolution doesn't work —
    walk sys.path directly."""
    if sys.platform != "win32":
        return
    candidates = []
    seen_bases = set()
    for sp in sys.path:
        nvidia_dir = os.path.join(sp, "nvidia")
        if not os.path.isdir(nvidia_dir) or nvidia_dir in seen_bases:
            continue
        seen_bases.add(nvidia_dir)
        for sub in os.listdir(nvidia_dir):
            bin_dir = os.path.join(nvidia_dir, sub, "bin")
            if os.path.isdir(bin_dir):
                candidates.append(bin_dir)
    for p in candidates:
        os.environ["PATH"] = p + os.pathsep + os.environ.get("PATH", "")
        try:
            os.add_dll_directory(p)  # type: ignore[attr-defined]
        except (AttributeError, OSError):
            pass
    if candidates:
        sys.stderr.write(
            f"[local-whisper] added {len(candidates)} CUDA DLL dirs from pip nvidia-* packages\n"
        )


def main() -> None:
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: local-whisper.py <audio_path>\n")
        sys.exit(2)

    audio_path = sys.argv[1]
    model_name = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
    device = os.environ.get("WHISPER_DEVICE", "cuda")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")

    _add_pip_cuda_dlls_to_path()

    sys.stderr.write(
        f"[local-whisper] loading {model_name} on {device}/{compute_type}\n"
    )

    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        sys.stderr.write(
            f"[local-whisper] ERROR: faster_whisper not installed: {e}\n"
            f"Install with: {sys.executable} -m pip install faster-whisper\n"
        )
        sys.exit(3)

    def _build(d: str, ct: str):
        sys.stderr.write(f"[local-whisper] WhisperModel({model_name!r}, device={d!r}, compute_type={ct!r})\n")
        return WhisperModel(model_name, device=d, compute_type=ct)

    def _try_transcribe(m):
        return m.transcribe(
            audio_path,
            beam_size=5,
            vad_filter=True,  # silence-trim improves WER on long podcasts
            word_timestamps=False,
        )

    # Two-stage fallback: device construction can succeed but the first
    # encode call fails when cuBLAS / cuDNN DLLs are unavailable. Catch both.
    model = None
    try:
        model = _build(device, compute_type)
    except Exception as e:
        sys.stderr.write(
            f"[local-whisper] {device}/{compute_type} construction failed: {e}; "
            f"falling back to cpu/int8\n"
        )
        device, compute_type = "cpu", "int8"
        model = _build(device, compute_type)

    sys.stderr.write(f"[local-whisper] transcribing {audio_path}\n")
    try:
        segments_iter, info = _try_transcribe(model)
        # Pull the first segment to surface CUDA-encode errors early.
        first_iter = iter(segments_iter)
        first = next(first_iter, None)
    except Exception as e:
        if device == "cpu":
            raise
        sys.stderr.write(
            f"[local-whisper] {device}/{compute_type} encode failed: {e}; "
            f"falling back to cpu/int8 (slower but reliable)\n"
        )
        device, compute_type = "cpu", "int8"
        model = _build(device, compute_type)
        segments_iter, info = _try_transcribe(model)
        first_iter = iter(segments_iter)
        first = next(first_iter, None)

    # Re-chain the first segment with the rest of the iterator.
    def _chain(head, rest):
        if head is not None:
            yield head
        yield from rest
    segments_iter = _chain(first, first_iter)

    segments = []
    full_text_parts = []
    for s in segments_iter:
        segments.append(
            {"start": float(s.start), "end": float(s.end), "text": s.text}
        )
        full_text_parts.append(s.text)
        # Heartbeat to stderr every 50 segments so the parent process can
        # see we're alive on long podcasts.
        if len(segments) % 50 == 0:
            sys.stderr.write(
                f"[local-whisper]   {len(segments)} segments processed "
                f"(t={segments[-1]['end']:.1f}s)\n"
            )
            sys.stderr.flush()

    out = {
        "text": " ".join(full_text_parts).strip(),
        "language": info.language,
        "duration": float(info.duration),
        "segments": segments,
    }
    sys.stdout.write(json.dumps(out))
    sys.stderr.write(
        f"[local-whisper] done — {len(segments)} segments, "
        f"{info.duration:.1f}s audio, language={info.language}\n"
    )


if __name__ == "__main__":
    main()
