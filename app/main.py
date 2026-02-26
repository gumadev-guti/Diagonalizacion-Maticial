# app/main.py
import os
import random
import json
import csv
import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

TEMPLATES_DIR = os.path.join(BASE_DIR, "../templates")
STATIC_DIR = os.path.join(BASE_DIR, "../static")
IMG_DIR = os.path.join(BASE_DIR, "../img")
DATA_DIR = os.path.join(BASE_DIR, "../data")


class Feedback(BaseModel):
    like: List[str]
    dislike: List[str] = []
    last_shown: List[str] = []


app = FastAPI()

DATA_CSV = os.path.join(BASE_DIR, "..", "data", "sports.csv")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/img", StaticFiles(directory=IMG_DIR), name="img")

templates = Jinja2Templates(directory=TEMPLATES_DIR)

likes_saved = []
dislikes_saved = []


def load_sports_features():
    with open(DATA_CSV, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        name_col = cols[0]

        sports = {}
        for row in reader:
            raw = row[name_col].strip()
            if not raw:
                continue
            name = raw.lower().replace(" ", "_")
            features = [float(row[c]) for c in cols[1:]]
            sports[name] = np.array(features, dtype=float)
    return sports


sports_features = load_sports_features()
ALL_SPORTS = list(sports_features.keys())

# ---- MATRIZ ITEM–ITEM Y AUTOVECTORES ----
M = np.array(list(sports_features.values()))
S = M @ M.T
eigvals, eigvecs = np.linalg.eig(S)
idx_max = np.argmax(eigvals)
v1 = eigvecs[:, idx_max]
v1_norm = v1 / (np.linalg.norm(v1) + 1e-12)


def cosine_similarity_vec(a, b):
    if a is None or b is None:
        return 0
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-12
    return float(np.dot(a, b) / denom)


def get_random_image_path(name):
    n = random.randint(1, 10)
    return f"/img/{name}/img ({n}).webp"


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    initial = random.sample(ALL_SPORTS, min(10, len(ALL_SPORTS)))
    payload = [{"name": s, "image": get_random_image_path(s)} for s in initial]
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "sports_json": json.dumps(payload)}
    )


@app.post("/save-feedback")
async def save_feedback(data: Feedback):
    global likes_saved, dislikes_saved
    likes_saved = data.like
    dislikes_saved = data.dislike
    return {"status": "ok"}


@app.post("/get-candidates")
async def get_candidates(data: Feedback):
    likes = [s for s in data.like if s in sports_features]
    dislikes = [s for s in data.dislike if s in sports_features]
    candidates = []

    if not likes:
        for s in ALL_SPORTS:
            candidates.append({
                "name": s,
                "score": random.random() * 0.01 + 0.01
            })
        candidates.sort(key=lambda x: x["score"], reverse=True)
        return candidates

    avg_like = np.mean([sports_features[s] for s in likes], axis=0)
    avg_dis = np.mean([sports_features[s] for s in dislikes], axis=0) if dislikes else None
    q_projection = float(np.dot(avg_like, v1_norm))

    for name in ALL_SPORTS:
        v = sports_features[name]
        sim_like = cosine_similarity_vec(avg_like, v)
        sim_dis = cosine_similarity_vec(avg_dis, v) if avg_dis is not None else 0
        proj_item = float(np.dot(v, v1_norm))
        alpha = 0.7
        beta = 0.25
        score = sim_like - alpha * sim_dis + beta * (proj_item * q_projection)
        candidates.append({"name": name, "score": float(score)})

    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates


@app.post("/math-metrics")
async def math_metrics(data: Feedback):
    likes = [s for s in data.like if s in sports_features]
    if likes:
        q = np.mean([sports_features[s] for s in likes], axis=0)
    else:
        q = np.zeros(M.shape[1])

    user_proj = float(np.dot(q, v1_norm))
    D = np.diag(eigvals)

    return {
        "q": q.tolist(),
        "eigenvalues": eigvals.tolist(),
        "eigenvectors": eigvecs.tolist(),
        "D": D.tolist(),
        "user_projection": user_proj
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )
