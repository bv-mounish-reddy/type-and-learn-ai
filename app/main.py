from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import llm, scores

STATIC = Path(__file__).resolve().parent.parent / "static"
app = FastAPI(title="Type & Learn AI")


class GenerateIn(BaseModel):
    mode: Literal["topic", "raw"]
    text: str = Field(min_length=1, max_length=6000)
    duration: Literal[30, 60, 120]


class ScoreIn(BaseModel):
    duration: Literal[30, 60, 120]
    wpm: float = Field(ge=0, le=400)
    accuracy: float = Field(ge=0, le=100)
    topic: str = ""


@app.post("/api/generate")
async def generate(body: GenerateIn):
    try:
        passage = await llm.generate(body.mode, body.text.strip(), body.duration)
    except llm.OllamaError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"passage": passage}


@app.get("/api/scores")
def get_scores():
    return scores.load()


@app.post("/api/scores")
def post_score(body: ScoreIn):
    return scores.add(body.duration, body.wpm, body.accuracy, body.topic)


app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
