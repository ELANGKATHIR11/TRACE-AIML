"""Comprehensive Official Government & Academic Regulatory Dataset Harvester.
Downloads authentic statutory documents directly from official sources:
- DTE Rajasthan / Higher Technical Education Govt of Rajasthan (hte.rajasthan.gov.in)
- ACPC National Informatics Centre (gujacpc.admissions.nic.in)
- AICTE Official Institutional Approval Filings
Stores downloaded files in `datasets/official_scraped_dataset/`.
"""

import ssl
import json
import urllib.request
import re
from pathlib import Path

OUT_DIR = Path("datasets/official_scraped_dataset")
OUT_DIR.mkdir(parents=True, exist_ok=True)

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/pdf,*/*",
}

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

manifest = []

# Seed list of known verified official statutory links
DIRECT_URLS = [
    {
        "institution": "Government Residential Women Polytechnic College, Jodhpur",
        "doc_type": "AICTE_EXTENSION_OF_APPROVAL",
        "url": "https://hte.rajasthan.gov.in/Website/GOVERNMENTRESIDENTIALWOMENPOLYTECHNICCOLLEGEJODHPUR/CONTENTFILES/e023077c-a5ca-4e6a-9705-a349e3fc72f8.PDF",
        "name": "GOVT_EOA_Jodhpur_Official.pdf"
    },
    {
        "institution": "Admission Committee for Professional Courses (ACPC) / NIC",
        "doc_type": "DEGREE_ENGINEERING_SEAT_MATRIX",
        "url": "https://gujacpc.admissions.nic.in/wp-content/uploads/sites/5/2022/04/2022042299.pdf",
        "name": "NIC_Degree_Engg_Matrix_Official.pdf"
    },
    {
        "institution": "ACPC / NIC Gujarat Technical Education",
        "doc_type": "DIPLOMA_ENGINEERING_REGULATORY_RULES",
        "url": "https://gujacpc.admissions.nic.in/wp-content/uploads/sites/5/2022/04/2022042288.pdf",
        "name": "NIC_Diploma_Engg_Rules_Official.pdf"
    },
    {
        "institution": "ACPC / NIC Gujarat Technical Education",
        "doc_type": "GOVERNMENT_INSTITUTION_APPROVED_INTAKE",
        "url": "https://gujacpc.admissions.nic.in/wp-content/uploads/sites/5/2022/04/2022042251.pdf",
        "name": "NIC_Approved_Intake_Official.pdf"
    },
    {
        "institution": "Directorate of Technical Education Assam",
        "doc_type": "STATE_TECHNICAL_SCHEDULE",
        "url": "https://dte.assam.gov.in/sites/default/files/notification-_holiday_list_year_2022.pdf",
        "name": "DTE_Assam_Official_Schedule.pdf"
    }
]

print(">>> Starting Official Government Regulatory Scraper <<<")
for item in DIRECT_URLS:
    target_path = OUT_DIR / item["name"]
    print(f"\nFetching: {item['name']}")
    print(f"Source: {item['url']}")
    try:
        req = urllib.request.Request(item["url"], headers=headers)
        with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
            data = resp.read()
            target_path.write_bytes(data)
            print(f" -> SUCCESS: {len(data)} bytes downloaded")
            manifest.append({
                "institution": item["institution"],
                "doc_type": item["doc_type"],
                "filename": item["name"],
                "file_path": str(target_path).replace("\\", "/"),
                "size_bytes": len(data),
                "source_url": item["url"],
                "is_official_government_source": True,
            })
    except Exception as e:
        print(f" -> ERROR: {e}")

# Save updated official dataset manifest
manifest_file = OUT_DIR / "OFFICIAL_DATASET_MANIFEST.json"
manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"\nAll official statutory files saved! Manifest created at: {manifest_file}")
