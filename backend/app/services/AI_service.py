"""100% Offline AI Information Extraction and Document Forensics Service.
Runs entirely on local hardware using Ollama (Qwen2.5 / SmolVLM) and local heuristic parsers.
Requires ZERO external API keys or cloud connections. Air-gap and government intranet safe.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.models.enums import DocumentType
from app.services.ollama_service import ollama_service

logger = logging.getLogger(__name__)


class LocalExtractorService:
    """Offline information extraction and digital forensics analyzer."""

    def extract_fields(self, document_type: DocumentType, ocr_text: str) -> Dict[str, Any]:
        """Extract domain-specific structured fields using 100% local models."""
        text_sample = ocr_text[:6000] if ocr_text else ""

        # 1. Primary: Offline Local LLM (Ollama Qwen2.5)
        if ollama_service.is_available() and len(text_sample.strip()) > 30:
            extracted = self._extract_with_local_llm(document_type, text_sample)
            if extracted:
                return extracted

        # 2. Fully Autonomous Regex & Pattern-Matching Fallback (Zero network/API required)
        return self._heuristic_extraction(document_type, ocr_text)

    def _extract_with_local_llm(self, document_type: DocumentType, text: str) -> Optional[Dict[str, Any]]:
        """Query local Ollama instance for structured JSON extraction."""
        system_prompt = (
            "You are an offline document verification engine for AICTE regulatory compliance. "
            "Extract key factual details from the document text provided. "
            "Return ONLY a clean JSON object containing the extracted key-value pairs. "
            "Do NOT hallucinate or extrapolate facts. If a field is not present, set its value to null."
        )

        user_prompt = f"""
Document Type: {document_type.value}
Document Text:
\"\"\"
{text}
\"\"\"

Extract the following key fields if found in the text:
- institution_name: Official college/institution name
- document_id_or_number: Certificate, survey, or registration number
- issue_date: Date issued (YYYY-MM-DD or raw date string)
- expiry_date: Expiration or validity date
- issuing_authority: Authority or official department that issued it
- land_area_acres: Total land area in acres
- total_faculty_count: Total number of teachers/faculty
- principal_name: Name of Principal or Director
- total_built_up_area: Total built-up floor area in square meters
- financial_balance: Bank account or trust balance amount

Output valid JSON only:
"""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        result = ollama_service.chat_completion(messages, temperature=0.1, response_json=True)
        if result.get("status") == "success":
            content = result.get("content", "").strip()
            try:
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0].strip()
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0].strip()
                data = json.loads(content)
                if isinstance(data, dict):
                    return {k: v for k, v in data.items() if v is not None}
            except Exception as e:
                logger.warning(f"Local Ollama extraction JSON parse warning: {e}")

        return None

    def _heuristic_extraction(self, document_type: DocumentType, text: str) -> Dict[str, Any]:
        """Offline regex and entity parser fallback."""
        data: Dict[str, Any] = {}
        if not text:
            return data

        # Extract dates
        date_pattern = r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b"
        dates = re.findall(date_pattern, text)
        if dates:
            data["detected_dates"] = dates[:3]
            data["issue_date"] = dates[0]

        # Extract land area
        land_match = re.search(r"(\d+(\.\d+)?)\s*(acres?|hectares?|sq\.?\s*meters?|sqm)", text, re.IGNORECASE)
        if land_match:
            data["land_area"] = land_match.group(0)
            data["land_area_acres"] = float(land_match.group(1))

        # Extract certificate or survey numbers
        cert_match = re.search(r"(certificate\s*no\.?|survey\s*no\.?|registration\s*no\.?|ref\s*no\.?)[:\s]*([A-Z0-9/-]+)", text, re.IGNORECASE)
        if cert_match:
            data["document_id_or_number"] = cert_match.group(2)

        # Extract institution name candidates
        inst_match = re.search(r"(institute|college|university|trust|polytechnic)\s+of\s+[\w\s]+", text, re.IGNORECASE)
        if inst_match:
            data["institution_name"] = inst_match.group(0).strip()

        return data

    def analyze_forensics(self, pdf_metadata: Dict[str, Any], fonts: List[str]) -> Dict[str, Any]:
        """Offline analysis of digital document metadata, tool fingerprints, and font anomalies."""
        anomalies: List[str] = []
        score = 0.0

        creator = (pdf_metadata.get("creator") or "").lower()
        producer = (pdf_metadata.get("producer") or "").lower()

        # Offline signature check for image/photo editing tools
        editing_tools = ["photoshop", "canva", "gimp", "illustrator", "inkscape", "coreldraw", "pdfescape", "ilovepdf"]
        for tool in editing_tools:
            if tool in creator or tool in producer:
                anomalies.append(f"Document modified with graphics editing software: {tool.title()}")
                score += 0.4

        # Creation vs modification date discrepancies
        c_date = pdf_metadata.get("creation_date", "")
        m_date = pdf_metadata.get("mod_date", "")
        if c_date and m_date and c_date != m_date:
            anomalies.append("Post-issuance alteration detected (Creation date differs from Modification date)")
            score += 0.2

        # Font divergence
        if len(fonts) > 8:
            anomalies.append(f"Excessive font variations detected ({len(fonts)} unique fonts), possible digital cut-and-paste")
            score += 0.3

        return {
            "forensic_score": min(round(score, 2), 1.0),
            "is_tampering_suspected": score >= 0.4,
            "anomalies_detected": anomalies,
            "metadata_audited": {
                "producer": producer,
                "creator": creator,
                "font_count": len(fonts),
            },
        }


# Aliased for backward compatibility with existing imports
gemini_service = LocalExtractorService()
local_extractor_service = gemini_service
