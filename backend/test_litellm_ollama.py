import os
import sys

# Ensure UTF-8 output encoding on Windows consoles
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import litellm

print("Testing LiteLLM connection to local Ollama...")
resp = litellm.completion(
    model="ollama/qwen2.5:1.5b-instruct",
    messages=[{"role": "user", "content": "Respond with 'Ollama LiteLLM Connection Verified'"}],
    api_base="http://localhost:11434"
)
print("Response:", resp.choices[0].message.content)
