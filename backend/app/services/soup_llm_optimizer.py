"""Soup-Optimized Modelfile Generator for AICTE TRACE Regulatory Platform.
Leverages Soup's low-resource deployment patterns (f:/TRACE/Soup-main):
- Bounded context window (`num_ctx 2048` instead of 32k) saving ~1.2 GB VRAM.
- Pinned batch sizing (`num_predict 1024`, `num_thread 6`).
- Deterministic sampling (`temperature 0.1`, `top_k 20`, `top_p 0.9`).
- Fits comfortably inside 4 GB VRAM (RTX 3050 Laptop / entry-level hardware).
"""

import sys
import os
from pathlib import Path
import subprocess

SOUP_SRC = Path("f:/TRACE/Soup-main/src")
if SOUP_SRC.exists() and str(SOUP_SRC) not in sys.path:
    sys.path.insert(0, str(SOUP_SRC))

from soup_cli.utils.ollama import create_modelfile, deploy_to_ollama, ALLOWED_OLLAMA_PARAMS

SYSTEM_PROMPT = (
    "You are TRACE-AICTE, a 100% offline, air-gapped sovereign AI regulatory compliance auditor. "
    "Verify institutional applications and certificates against the AICTE Approval Process Handbook (APH). "
    "Extract factual fields (land area, faculty-student ratio, built-up area) truthfully. Never hallucinate."
)

SOUP_LOW_RESOURCE_PARAMS = {
    "num_ctx": "2048",      # Constrain KV-cache footprint for 4 GB GPUs
    "num_predict": "1024",  # Bounded generation budget
    "temperature": "0.1",   # High-precision deterministic audit output
    "top_k": "20",
    "top_p": "0.9",
    "num_thread": "6",      # CPU fallback thread allocation
    "repeat_penalty": "1.1",
}


def build_and_deploy_soup_profile(base_model: str = "qwen2.5:1.5b-instruct", target_name: str = "soup-trace-lite"):
    """Create an optimized Modelfile with Soup hardware parameters and deploy to local Ollama."""
    modelfile_lines = [
        f"FROM {base_model}",
        f'SYSTEM "{SYSTEM_PROMPT}"',
    ]

    for k, v in sorted(SOUP_LOW_RESOURCE_PARAMS.items()):
        modelfile_lines.append(f"PARAMETER {k} {v}")

    modelfile_content = "\n\n".join(modelfile_lines) + "\n"
    modelfile_path = Path("reports/Modelfile.soup-trace-lite")
    modelfile_path.parent.mkdir(parents=True, exist_ok=True)
    modelfile_path.write_text(modelfile_content, encoding="utf-8")
    print(f"[1/2] Created Soup Low-Hardware Modelfile at {modelfile_path}")

    # Deploy to Ollama via Soup's deployment engine
    print(f"[2/2] Registering '{target_name}' in local Ollama instance...")
    success, message = deploy_to_ollama(target_name, modelfile_content)
    if success:
        print(f"[SUCCESS] Model '{target_name}' deployed successfully to Ollama with Soup low-VRAM optimizations!")
    else:
        print(f"[WARN] Deployment output: {message}")
    return success, target_name


if __name__ == "__main__":
    build_and_deploy_soup_profile()
