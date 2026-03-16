"""
Whisper Transcription Sidecar
==============================
FastAPI server that accepts audio uploads and transcribes them using
the openai-whisper Python library.

Requirements:
    pip install -r requirements.txt

Usage:
    python server.py                    # starts on http://localhost:8000
    python server.py --port 8001        # custom port
    python server.py --host 0.0.0.0    # bind to all interfaces
"""

import argparse
import io
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
import whisper
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("whisper-sidecar")

# ---------------------------------------------------------------------------
# Model cache — loaded once per process, reloaded on model change
# ---------------------------------------------------------------------------

_loaded_model_name: Optional[str] = None
_model: Optional[whisper.Whisper] = None

VALID_MODELS = {"tiny", "base", "small", "medium", "large-v3"}


def get_model(name: str) -> whisper.Whisper:
    global _loaded_model_name, _model
    if _model is None or _loaded_model_name != name:
        if name not in VALID_MODELS:
            raise ValueError(f"Unknown model '{name}'. Valid options: {sorted(VALID_MODELS)}")
        log.info("Loading whisper model '%s' …", name)
        _model = whisper.load_model(name)
        _loaded_model_name = name
        log.info("Model '%s' ready.", name)
    return _model


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load the default model at startup so the first request is fast.
    default_model = os.environ.get("WHISPER_MODEL", "base")
    try:
        get_model(default_model)
    except Exception as exc:
        log.warning("Could not pre-load model at startup: %s", exc)
    yield


app = FastAPI(
    title="Whisper Transcription Sidecar",
    description="Local transcription server for the Obsidian Whisper plugin.",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow requests from Obsidian (Electron / file:// / app:// origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Simple liveness check — the plugin can poll this to confirm the server is up."""
    return {"status": "ok", "loaded_model": _loaded_model_name}


@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(..., description="Audio file (webm, wav, mp3, mp4, ogg, …)"),
    model: str = Form("base", description="Whisper model name"),
    language: Optional[str] = Form(None, description="ISO 639-1 language code, or omit for auto-detect"),
):
    """
    Transcribe an uploaded audio file.

    Returns JSON:
        {
          "text": "transcribed text",
          "language": "en"   // detected or provided language
        }
    """
    if model not in VALID_MODELS:
        raise HTTPException(status_code=400, detail=f"Invalid model '{model}'. Choose from: {sorted(VALID_MODELS)}")

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # whisper.load_audio() expects a file path, so we write to a temp file.
    suffix = _suffix_from_content_type(file.content_type, file.filename)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        whisper_model = get_model(model)
        log.info(
            "Transcribing %d bytes with model='%s', language=%s",
            len(audio_bytes),
            model,
            language or "auto",
        )

        options: dict = {}
        if language:
            options["language"] = language

        result = whisper_model.transcribe(tmp_path, **options)

        text: str = result.get("text", "").strip()
        detected: str = result.get("language", "")

        log.info("Done — %d chars, detected language: %s", len(text), detected)
        return {"text": text, "language": detected}

    except Exception as exc:
        log.error("Transcription failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _suffix_from_content_type(content_type: Optional[str], filename: Optional[str]) -> str:
    """Derive a file extension so that ffmpeg (used internally by whisper) picks the right decoder."""
    if filename:
        _, ext = os.path.splitext(filename)
        if ext:
            return ext
    mime_map = {
        "audio/webm": ".webm",
        "audio/ogg": ".ogg",
        "audio/mp4": ".mp4",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
    }
    if content_type:
        for mime, ext in mime_map.items():
            if content_type.startswith(mime):
                return ext
    return ".webm"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Whisper transcription sidecar")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    parser.add_argument(
        "--model",
        default=os.environ.get("WHISPER_MODEL", "base"),
        choices=sorted(VALID_MODELS),
        help="Whisper model to pre-load (default: base)",
    )
    args = parser.parse_args()

    os.environ["WHISPER_MODEL"] = args.model
    log.info("Starting sidecar on http://%s:%d  (model: %s)", args.host, args.port, args.model)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
