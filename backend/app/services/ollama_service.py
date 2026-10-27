"""Ollama local LLM inference client for TRACE / AICTE regulatory verification."""

import json
import logging
from typing import Any, Dict, List, Optional
import urllib.request
import urllib.error

from app.config import settings

logger = logging.getLogger(__name__)


class OllamaService:
    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None):
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        self.default_model = model or settings.OLLAMA_MODEL

    def is_available(self) -> bool:
        """Verify if Ollama instance is reachable."""
        try:
            req = urllib.request.Request(f"{self.base_url}/api/tags", headers={"User-Agent": "TRACE-AICTE/1.0"})
            with urllib.request.urlopen(req, timeout=3.0) as res:
                return res.status == 200
        except Exception as e:
            logger.warning(f"Ollama server not accessible at {self.base_url}: {e}")
            return False

    def list_models(self) -> List[str]:
        """Fetch list of local models available in Ollama."""
        try:
            req = urllib.request.Request(f"{self.base_url}/api/tags", headers={"User-Agent": "TRACE-AICTE/1.0"})
            with urllib.request.urlopen(req, timeout=5.0) as res:
                if res.status == 200:
                    data = json.loads(res.read().decode("utf-8"))
                    return [m.get("name") for m in data.get("models", [])]
        except Exception as e:
            logger.error(f"Failed to fetch Ollama models: {e}")
        return []

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        response_json: bool = False,
    ) -> Dict[str, Any]:
        """Execute chat completion via Ollama's OpenAI-compatible endpoint."""
        target_model = model or self.default_model
        payload: Dict[str, Any] = {
            "model": target_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_json:
            payload["response_format"] = {"type": "json_object"}

        req = urllib.request.Request(
            f"{self.base_url}/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "TRACE-AICTE/1.0"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=120.0) as res:
                if res.status == 200:
                    result = json.loads(res.read().decode("utf-8"))
                    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                    return {
                        "status": "success",
                        "content": content,
                        "model": target_model,
                        "usage": result.get("usage", {}),
                    }
                else:
                    return {"status": "error", "error": f"Ollama returned HTTP status {res.status}"}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8") if e.fp else str(e)
            return {"status": "error", "error": f"Ollama HTTP error {e.code}: {err_body}"}
        except Exception as e:
            return {"status": "error", "error": f"Ollama connection error: {str(e)}"}


ollama_service = OllamaService()
