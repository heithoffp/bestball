"""Abstract base class for projection sources."""

import json
import os
import time
from abc import ABC, abstractmethod
from datetime import date
from typing import List

import requests

from scrapers.config import CACHE_DIR
from scrapers.models import PlayerProjection


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


class BaseSource(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @abstractmethod
    def fetch_projections(self) -> List[PlayerProjection]:
        ...

    def _request_with_retry(self, url: str, headers: dict = None,
                            max_retries: int = 3, delay: float = 2) -> requests.Response:
        """GET with retry on 429/503, exponential backoff."""
        hdrs = {"User-Agent": USER_AGENT}
        if headers:
            hdrs.update(headers)

        last_exc = None
        for attempt in range(max_retries):
            try:
                resp = requests.get(url, headers=hdrs, timeout=30)
                if resp.status_code in (400, 403, 404, 405):
                    resp.raise_for_status()  # client errors = don't retry
                if resp.status_code in (429, 503) and attempt < max_retries - 1:
                    wait = delay * (2 ** attempt)
                    print(f"  [{self.name}] {resp.status_code} on {url}, retrying in {wait}s...")
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp
            except requests.RequestException as e:
                last_exc = e
                if attempt < max_retries - 1:
                    wait = delay * (2 ** attempt)
                    print(f"  [{self.name}] Request error: {e}, retrying in {wait}s...")
                    time.sleep(wait)
        raise last_exc

    def _rate_limit(self, seconds: float = 2):
        """Simple sleep between requests."""
        time.sleep(seconds)

    # --- Caching ---

    def _cache_path(self, today: str = None) -> str:
        today = today or date.today().isoformat()
        return os.path.join(CACHE_DIR, f"{self.name}_{today}.json")

    def _get_cached(self, today: str = None) -> List[dict] | None:
        path = self._cache_path(today)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return None

    def _set_cached(self, data: List[dict], today: str = None):
        os.makedirs(CACHE_DIR, exist_ok=True)
        path = self._cache_path(today)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)

    @staticmethod
    def _projections_to_dicts(projections: List[PlayerProjection]) -> List[dict]:
        return [p.__dict__ for p in projections]

    @staticmethod
    def _dicts_to_projections(dicts: List[dict]) -> List[PlayerProjection]:
        return [PlayerProjection(**d) for d in dicts]
