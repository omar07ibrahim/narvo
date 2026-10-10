"""
NARVO on-device speech-to-text server (Apple Silicon).

OpenAI-compatible endpoint:  POST /v1/audio/transcriptions  (multipart: file, model, language)
Backed by mlx-whisper (Whisper large-v3-turbo running on the Mac's GPU via MLX). No network after
the first model download.

Setup (once):
    python3 -m venv .venv-stt && source .venv-stt/bin/activate
    pip install mlx-whisper fastapi uvicorn python-multipart
Run:
    python tools/stt_server.py            # listens on 127.0.0.1:8090
Then in .env.local:
    LOCAL_STT_BASE_URL=http://127.0.0.1:8090/v1
"""

import os
import tempfile
import time

import mlx_whisper
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile

MODEL = os.environ.get("NARVO_WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")
app = FastAPI(title="NARVO STT")


@app.get("/v1/models")
def models():
    return {"data": [{"id": "whisper-large-v3-turbo", "object": "model"}]}


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("whisper-large-v3-turbo"),
    language: str | None = Form(None),
    response_format: str = Form("json"),
):
    t0 = time.time()
    suffix = os.path.splitext(file.filename or "speech.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        path = tmp.name
    try:
        result = mlx_whisper.transcribe(path, path_or_hf_repo=MODEL, language=language or None)
    finally:
        os.unlink(path)
    return {"text": result.get("text", "").strip(), "language": result.get("language"), "duration_ms": int((time.time() - t0) * 1000)}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8090")))
