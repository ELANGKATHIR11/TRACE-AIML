"""In-process sliding-window rate limiter.

State lives in this process only: with several workers/processes each one enforces its own
window, so the effective limit is multiplied by the process count (documented limitation).
"""
import threading
import time
from collections import deque

_SWEEP_THRESHOLD = 10_000


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, hits: deque[float], cutoff: float) -> None:
        while hits and hits[0] <= cutoff:
            hits.popleft()

    def hit(self, key: str) -> bool:
        """Record an attempt for `key`; return False (and record nothing) if over the limit."""
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            if len(self._hits) > _SWEEP_THRESHOLD:
                self._sweep(cutoff)
            hits = self._hits.setdefault(key, deque())
            self._prune(hits, cutoff)
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True

    def _sweep(self, cutoff: float) -> None:
        for key in list(self._hits):
            self._prune(self._hits[key], cutoff)
            if not self._hits[key]:
                del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
