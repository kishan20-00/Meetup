# Obsidian Whisper Transcription Plugin

Record audio directly in Obsidian and transcribe it into your notes using a local [Whisper](https://github.com/openai/whisper) model. Optionally translate the result via OpenAI or DeepL.

---

## Features

- One-click recording from the ribbon icon or command palette
- Fully local transcription — audio never leaves your machine
- Optional translation (OpenAI GPT or DeepL)
- Insert transcription as plain text, callout block, or timestamped header
- Choose from 5 Whisper model sizes (tiny to large-v3)

---

## Requirements

- Obsidian **desktop** (Windows / macOS / Linux) — not supported on mobile
- Python 3.9+
- `ffmpeg` installed and on your PATH

---

## Setup

### 1. Install the Python sidecar

```bash
cd sidecar
pip install -r requirements.txt
```

> **ffmpeg** is required by Whisper for audio decoding.
> - Windows: `winget install ffmpeg` or download from https://ffmpeg.org
> - macOS: `brew install ffmpeg`
> - Linux: `sudo apt install ffmpeg`

### 2. Start the sidecar

```bash
python sidecar/server.py
```

Optional flags:

```bash
python sidecar/server.py --model small --port 8000
```

The sidecar pre-loads the selected Whisper model at startup. Leave this terminal running while you use Obsidian.

### 3. Install the plugin in Obsidian

1. Copy this folder into your vault's `.obsidian/plugins/obsidian-whisper-plugin/`
2. Build the plugin:
   ```bash
   npm install
   npm run build
   ```
3. Enable the plugin in **Settings → Community plugins**

---

## Usage

1. Open a note and place your cursor where you want the transcription inserted
2. Click the microphone icon in the ribbon **or** use the command palette (`Ctrl/Cmd+P`) → **Start recording**
3. Speak
4. Click the icon again **or** run **Stop recording and transcribe**
5. The transcribed text is inserted at the cursor

---

## Settings

| Setting | Description |
|---|---|
| **Sidecar URL** | URL of the Python server (default: `http://localhost:8000`) |
| **Whisper model** | Model size. `base` is recommended for most users |
| **Source language** | Language spoken. Use *Auto-detect* if unsure |
| **Enable translation** | Translate transcription to a target language |
| **Translation provider** | OpenAI (GPT-4o mini) or DeepL |
| **Output format** | Plain text / callout block / timestamp header |
| **Max recording duration** | Auto-stop after N seconds (0 = unlimited) |

---

## Whisper Model Sizes

| Model | Size | Notes |
|---|---|---|
| `tiny` | ~75 MB | Very fast, lower accuracy |
| `base` | ~145 MB | Fast, good for everyday use |
| `small` | ~465 MB | Balanced |
| `medium` | ~1.5 GB | High accuracy, slow |
| `large-v3` | ~3 GB | Best accuracy, very slow |

Without a GPU, `base` or `small` is recommended.

---

## Architecture

```
Obsidian Plugin (TypeScript)
  |  records audio via MediaRecorder API
  |  POST /transcribe  (multipart/form-data)
  v
Python Sidecar (FastAPI + openai-whisper)
  |  transcribes with local Whisper model
  +- returns { text, language }
```

---

## Development

```bash
npm install
npm run dev    # watch mode, rebuilds on change
```

Place the built `main.js`, `manifest.json`, and `styles.css` in your vault's plugin folder to test live.

---

## License

MIT
