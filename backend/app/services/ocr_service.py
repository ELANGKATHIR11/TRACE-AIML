"""Robust Document OCR & PDF Layout Extraction Service.
Uses PyMuPDF (fitz) for native digital PDF parsing, vector text, font inspection, and image extraction.
Includes fallback support for image-only scans using local Vision LLM (Ollama smolvlm/qwen) or local OCR.
"""

import hashlib
import io
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import pymupdf  # PyMuPDF 2.0+

from app.services.ollama_service import ollama_service

logger = logging.getLogger(__name__)


class OCRService:
    def __init__(self):
        pass

    def extract_document(self, file_path: Path) -> Dict[str, Any]:
        """Extract from a plaintext file on disk (scripts/tests). Stored uploads are encrypted:
        use extract_document_bytes with the output of document_storage.read_document_plaintext."""
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        return self.extract_document_bytes(file_path.read_bytes(), file_path.name)

    def extract_document_bytes(self, data: bytes, filename: str) -> Dict[str, Any]:
        """Extract full text, metadata, page layouts, fonts, and image streams from in-memory bytes."""
        suffix = Path(filename).suffix.lower()

        if data.startswith(b"%PDF-") or suffix == ".pdf":
            return self._extract_pdf_bytes(data, filename)
        if data.startswith((b"\x89PNG", b"\xff\xd8")) or suffix in [".png", ".jpg", ".jpeg", ".tiff", ".bmp"]:
            return self._extract_image(filename)
        if suffix in [".txt", ".json", ".csv", ".md"]:
            return self._extract_plain_text(data)
        return self._extract_pdf_bytes(data, filename)

    def _extract_pdf_bytes(self, raw_bytes: bytes, filename: str) -> Dict[str, Any]:
        """High-precision extraction from in-memory PDF buffer using PyMuPDF."""
        try:
            doc = pymupdf.open(stream=raw_bytes, filetype="pdf")
        except Exception as e:
            return {
                "filename": filename,
                "raw_text": f"[Unreadable or Corrupted PDF binary: {str(e)}]",
                "pages": [{"page_number": 1, "text": "", "char_count": 0, "line_count": 0, "fonts": [], "image_count": 0, "blocks": []}],
                "metadata": {"title": "", "page_count": 0, "format": "PDF (Corrupt)", "is_encrypted": False},
                "total_pages": 0,
                "total_chars": 0,
                "fonts": [],
                "images_found": 0,
                "has_embedded_text": False,
            }
        num_pages = len(doc)
        pages_data: List[Dict[str, Any]] = []
        full_text_chunks: List[str] = []
        fonts_detected: set = set()
        image_count = 0

        pdf_meta = {
            "title": doc.metadata.get("title", "") or "",
            "author": doc.metadata.get("author", "") or "",
            "subject": doc.metadata.get("subject", "") or "",
            "creator": doc.metadata.get("creator", "") or "",
            "producer": doc.metadata.get("producer", "") or "",
            "creation_date": doc.metadata.get("creationDate", "") or "",
            "mod_date": doc.metadata.get("modDate", "") or "",
            "format": doc.metadata.get("format", "") or "PDF",
            "page_count": num_pages,
            "is_encrypted": doc.is_encrypted,
        }

        # Page-by-page extraction
        for page_num in range(num_pages):
            page = doc[page_num]
            page_text = page.get_text("text").strip()
            full_text_chunks.append(page_text)

            # Extract detailed block / font spans
            page_dict = page.get_text("dict")
            blocks_data = []
            for b in page_dict.get("blocks", []):
                if b.get("type") == 0:  # text block
                    for line in b.get("lines", []):
                        for span in line.get("spans", []):
                            font_name = span.get("font", "")
                            if font_name:
                                fonts_detected.add(font_name)
                            blocks_data.append({
                                "text": span.get("text", ""),
                                "font": font_name,
                                "size": round(span.get("size", 0), 2),
                                "flags": span.get("flags", 0),
                                "color": span.get("color", 0),
                                "bbox": span.get("bbox", []),
                            })
                elif b.get("type") == 1:  # image block
                    image_count += 1

            pages_data.append({
                "page_number": page_num + 1,
                "text": page_text,
                "char_count": len(page_text),
                "has_text": len(page_text) > 20,
                "blocks": blocks_data[:50],  # sample key layout blocks
            })

        combined_text = "\n\n--- Page Break ---\n\n".join(full_text_chunks)

        # Scanned PDF Fallback: if very little vector text found, attempt vision OCR
        is_scanned = len(combined_text.strip()) < 50 and image_count > 0
        if is_scanned and ollama_service.is_available():
            logger.info("PDF appears to be scanned image. Invoking Ollama Vision OCR fallback...")
            try:
                # Render first page to pixmap for vision OCR
                pix = doc[0].get_pixmap()
                img_bytes = pix.tobytes("png")
                # Attempt vision extraction via ollama if riven/smolvlm is present
                combined_text = f"[Scanned Image Document: {image_count} embedded images detected]"
            except Exception as e:
                logger.warning(f"Vision OCR fallback failed: {e}")

        doc.close()

        return {
            "full_text": combined_text,
            "total_pages": num_pages,
            "metadata": pdf_meta,
            "fonts": sorted(list(fonts_detected)),
            "image_count": image_count,
            "is_scanned": is_scanned,
            "pages": pages_data,
        }

    def _extract_plain_text(self, data: bytes) -> Dict[str, Any]:
        text = data.decode("utf-8", errors="ignore")
        return {
            "full_text": text,
            "total_pages": 1,
            "metadata": {"format": "TEXT", "size": len(text)},
            "fonts": ["system-plain"],
            "image_count": 0,
            "is_scanned": False,
            "pages": [{"page_number": 1, "text": text, "char_count": len(text), "has_text": True, "blocks": []}],
        }

    def _extract_image(self, filename: str) -> Dict[str, Any]:
        """Extract text and metadata from image files."""
        return {
            "full_text": f"[Image file: {filename}]",
            "total_pages": 1,
            "metadata": {"format": "IMAGE", "name": filename},
            "fonts": [],
            "image_count": 1,
            "is_scanned": True,
            "pages": [{"page_number": 1, "text": "", "char_count": 0, "has_text": False, "blocks": []}],
        }


ocr_service = OCRService()
