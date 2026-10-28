"""Talks to the local Ollama server and turns its output into typeable text."""
import os
import re
import unicodedata

import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "gemma3:4b")

# Keep passages long enough to type for the selected round without over-generating.
WORDS = {30: 70, 60: 140, 120: 280}
WORD_GUIDANCE = {30: "60 to 70", 60: "125 to 140", 120: "250 to 280"}

SYSTEM = (
    "Write only the requested factual passage. Start with its first fact; never mention "
    "the prompt, the user, or your process. Use lowercase words separated by spaces, "
    "with no punctuation, digits, title, or list."
)


class OllamaError(Exception):
    pass


def build_prompt(mode: str, text: str, words: int, duration: int) -> str:
    length = WORD_GUIDANCE[duration]
    if mode == "raw":
        return (
            f"Turn these notes into one flowing passage of {length} words. Preserve "
            f"their key facts and add nothing.\n\n{text}"
        )
    return (
        f"Write one factual passage of {length} words explaining this topic. "
        f"Include concrete terms worth remembering.\n\n{text}"
    )


_SMART = {"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
          "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00a0": " "}


def clean(text: str) -> str:
    """Keep lowercase alphabetic words only, separated by single spaces."""
    for src, dst in _SMART.items():
        text = text.replace(src, dst)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(re.findall(r"[a-z]+", text.lower()))


async def generate(mode: str, text: str, duration: int) -> str:
    payload = {
        "model": MODEL,
        "stream": False,
        "think": False,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": build_prompt(mode, text, WORDS[duration], duration)},
        ],
        "options": {"temperature": 0.3, "num_predict": WORDS[duration] * 2},
    }
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
    except httpx.ConnectError:
        raise OllamaError(f"Can't reach Ollama at {OLLAMA_URL}. Start it with `ollama serve`.")
    except httpx.TimeoutException:
        raise OllamaError("Ollama took too long to answer. Try a shorter round or a smaller input.")

    if r.status_code == 404:
        raise OllamaError(f"Model not found. Run `ollama pull {MODEL}` and try again.")
    if r.status_code != 200:
        raise OllamaError(f"Ollama returned an error ({r.status_code}).")

    content = r.json().get("message", {}).get("content", "")
    passage = clean(content)
    if len(passage.split()) < 15:
        raise OllamaError("The model returned too little text. Try again or rephrase.")
    return passage
