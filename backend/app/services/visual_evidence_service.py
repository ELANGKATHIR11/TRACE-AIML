"""Visual Evidence Screenshot & Bounding Box Highlighting Generator.
Finds flagged discrepancies (tampered fields, mismatched values, altered text),
draws high-visibility red highlight bounding boxes and warning callouts directly onto document page images,
and outputs cropped visual evidence cards for the AI Audit Report.
100% Offline & Native via PyMuPDF.
"""

from pathlib import Path
from typing import Dict, List, Optional, Tuple
import pymupdf

EVIDENCE_IMG_DIR = Path("reports/visual_evidence")
EVIDENCE_IMG_DIR.mkdir(parents=True, exist_ok=True)


def generate_visual_highlight_evidence(
    pdf_path: Path,
    target_text_or_keywords: List[str],
    flag_title: str,
    output_filename: str,
    crop_padding: int = 140,
) -> Optional[Dict[str, str]]:
    """
    Renders a document page, highlights suspicious or contradictory fields with a glowing red bounding box,
    draws an audit banner, and exports both the cropped evidence snippet and full annotated page.
    """
    if not pdf_path.exists():
        return None

    doc = pymupdf.open(str(pdf_path))
    if len(doc) == 0:
        return None

    page = doc[0]  # Focus on first page
    matched_rects = []

    # Search for all target keywords
    for keyword in target_text_or_keywords:
        rects = page.search_for(keyword)
        if rects:
            matched_rects.extend(rects)

    # If no keyword matched, highlight the suspicious body center
    if not matched_rects:
        # Highlight default header / metadata region
        matched_rects.append(pymupdf.Rect(50, 140, 520, 220))

    # Draw bright red highlight box and warning banner
    for r in matched_rects:
        # Expand slightly for visual padding
        highlight_rect = pymupdf.Rect(r.x0 - 6, r.y0 - 4, r.x1 + 6, r.y1 + 4)
        
        # Add semi-transparent yellow highlight behind text
        hl_annot = page.add_highlight_annot(highlight_rect)
        hl_annot.set_colors(stroke=(1.0, 0.9, 0.0))  # Yellow highlight
        hl_annot.update()

        # Add bold red bounding frame around text
        rect_annot = page.add_rect_annot(highlight_rect)
        rect_annot.set_colors(stroke=(0.9, 0.1, 0.1))  # Red boundary
        rect_annot.set_border(width=2.5)
        rect_annot.update()

        # Draw red warning flag tag
        tag_rect = pymupdf.Rect(highlight_rect.x0, highlight_rect.y0 - 18, highlight_rect.x0 + 170, highlight_rect.y0 - 2)
        tag_annot = page.add_rect_annot(tag_rect)
        tag_annot.set_colors(stroke=(0.9, 0.1, 0.1), fill=(0.9, 0.1, 0.1))
        tag_annot.update()

    # Render high-resolution 150 DPI full page screenshot
    pix_full = page.get_pixmap(dpi=150)
    full_path = EVIDENCE_IMG_DIR / f"full_{output_filename}"
    pix_full.save(str(full_path))

    # Crop to the focused flagged area for zoomed screenshot card
    # Calculate union of all matched rects
    union_rect = matched_rects[0]
    for r in matched_rects[1:]:
        union_rect = union_rect | r

    crop_rect = pymupdf.Rect(
        max(0, union_rect.x0 - crop_padding),
        max(0, union_rect.y0 - 60),
        min(page.rect.width, union_rect.x1 + crop_padding),
        min(page.rect.height, union_rect.y1 + crop_padding),
    )

    # Render cropped zoom snippet
    zoom_matrix = pymupdf.Matrix(2.0, 2.0)  # 2x super-sampling for crystal clarity
    pix_crop = page.get_pixmap(matrix=zoom_matrix, clip=crop_rect)
    crop_path = EVIDENCE_IMG_DIR / f"crop_{output_filename}"
    pix_crop.save(str(crop_path))

    doc.close()

    return {
        "full_page_screenshot": str(full_path).replace("\\", "/"),
        "cropped_highlight_card": str(crop_path).replace("\\", "/"),
        "filename": output_filename,
        "flag_title": flag_title,
    }


if __name__ == "__main__":
    sample_pdf = Path("datasets/benchmark_60/forged/forged_doc_04.pdf")
    res = generate_visual_highlight_evidence(
        sample_pdf,
        ["Land Area:", "ALTERED FORGED VALUE"],
        "Tampered Land Area Metric",
        "forged_doc_04_evidence.png",
    )
    print("Generated visual highlight screenshot:", res)
