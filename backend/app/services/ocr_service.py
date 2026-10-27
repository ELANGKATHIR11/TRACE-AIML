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

    def extract_document(self, file_path: Path, app_id: Optional[int] = None) -> Dict[str, Any]:
        """Extract full text, metadata, page layouts, fonts, and image streams from PDF or text documents."""
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        # Check if file is encrypted with AES-256-GCM
        raw_bytes = file_path.read_bytes()
        from app.services.production_security import production_security
        
        # Transparently decrypt if file starts with AES-256 header (not standard PDF/image magic)
        is_magic = raw_bytes.startswith(b"%PDF-") or raw_bytes.startswith(b"\x89PNG") or raw_bytes.startswith(b"\xff\xd8")
        if not is_magic:
            try:
                decrypted = production_security.decrypt_file_data(raw_bytes, associated_metadata=f"APP-{app_id}" if app_id else "AICTE-DOSSIER-V1")
                raw_bytes = decrypted
            except Exception:
                pass  # Fallback to direct reading

        suffix = file_path.suffix.lower()

        if suffix == ".pdf" or raw_bytes.startswith(b"%PDF-"):
            return self._extract_pdf_bytes(raw_bytes, file_path.name)
        elif suffix in [".png", ".jpg", ".jpeg", ".tiff", ".bmp"]:
            return self._extract_image(file_path)
        elif suffix in [".txt", ".json", ".csv", ".md"]:
            return self._extract_plain_text(file_path)
        else:
            return self._extract_pdf_bytes(raw_bytes, file_path.name)

    def _extract_pdf_bytes(self, raw_bytes: bytes, filename: str) -> Dict[str, Any]:
        """High-precision extraction from in-memory PDF buffer using PyMuPDF."""
        doc = pymupdf.open(stream=raw_bytes, filetype="pdf")
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

        # Scanned PDF Fallback: if very little vector text found, execute PyMuPDF Tesseract OCR
        is_scanned = (len(combined_text.strip()) < 50 and num_pages > 0)
        tessdata_dir = "f:/TRACE/tesseract-main/tessdata"
        if is_scanned and Path(tessdata_dir).exists():
            logger.info("Scanned document detected. Executing local Tesseract OCR via PyMuPDF...")
            ocr_chunks: List[str] = []
            for page_num in range(num_pages):
                try:
                    tp = doc[page_num].get_textpage_ocr(tessdata=tessdata_dir, language="eng")
                    ocr_text = tp.extractText().strip()
                    if ocr_text:
                        ocr_chunks.append(ocr_text)
                except Exception as e:
                    logger.warning(f"Page {page_num + 1} Tesseract OCR failed: {e}")
            if ocr_chunks:
                combined_text = "\n\n--- OCR Extracted Page ---\n\n".join(ocr_chunks)

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

    def _extract_plain_text(self, file_path: Path) -> Dict[str, Any]:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        return {
            "full_text": text,
            "total_pages": 1,
            "metadata": {"format": "TEXT", "size": len(text)},
            "fonts": ["system-plain"],
            "image_count": 0,
            "is_scanned": False,
            "pages": [{"page_number": 1, "text": text, "char_count": len(text), "has_text": True, "blocks": []}],
        }

    def _extract_image(self, file_path: Path) -> Dict[str, Any]:
        """Extract text and metadata from image files using local PyMuPDF Tesseract OCR."""
        text = ""
        tessdata_dir = "f:/TRACE/tesseract-main/tessdata"
        try:
            img_doc = pymupdf.open(str(file_path))
            pdf_bytes = img_doc.convert_to_pdf()
            pdf_doc = pymupdf.open("pdf", pdf_bytes)
            if Path(tessdata_dir).exists():
                tp = pdf_doc[0].get_textpage_ocr(tessdata=tessdata_dir, language="eng")
                text = tp.extractText().strip()
            pdf_doc.close()
            img_doc.close()
        except Exception as e:
            logger.warning(f"Image OCR failed for {file_path.name}: {e}")
            text = f"[Image file: {file_path.name}]"

        return {
            "full_text": text or f"[Image file: {file_path.name}]",
            "total_pages": 1,
            "metadata": {"format": "IMAGE", "name": file_path.name},
            "fonts": [],
            "image_count": 1,
            "is_scanned": True,
            "pages": [{"page_number": 1, "text": text, "char_count": len(text), "has_text": bool(text), "blocks": []}],
        }


ocr_service = OCRService()
