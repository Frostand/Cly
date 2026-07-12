import os
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["RFM_DATABASE_PATH"] = str(
    Path(__file__).resolve().parent / "tmp" / "topic-validation.sqlite3"
)

from app.main import app
from app.models.runs import TOPIC_MAX_LENGTH


client = TestClient(app)


def test_create_run_rejects_topic_over_max_length() -> None:
    response = client.post("/api/v1/runs", json={"topic": "a" * (TOPIC_MAX_LENGTH + 1)})

    assert response.status_code == 422
    assert "at most" in response.text


def test_search_route_rejects_topic_over_max_length() -> None:
    response = client.get(
        "/api/v1/search/arxiv",
        params={"topic": "a" * (TOPIC_MAX_LENGTH + 1)},
    )

    assert response.status_code == 422
    assert "at most" in response.text
