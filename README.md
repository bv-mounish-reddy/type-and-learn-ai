# Type & Learn AI
# Type & Learn AI
A tiny Monkeytype-style trainer. Give it a topic or paste raw notes, a local
Ollama model writes a passage, and you type it against the clock. Typing the
material is how you remember it.

## Run

```bash
# 1. model (once)
ollama pull gemma3:4b

# 2. app
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://localhost:8000.

## Structure

```
app/main.py     routes: /api/generate, /api/scores
app/llm.py      Ollama call, prompts, text cleanup
app/scores.py   top 5 scores per round length (data/scores.json)
static/         index.html, style.css, app.js (no build step)
data/           scores.json is created here
```

## Config (env vars)

| Variable       | Default                  |
|----------------|--------------------------|
| OLLAMA_MODEL   | gemma3:4b               |
| OLLAMA_URL     | http://localhost:11434   |
