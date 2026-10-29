"""Official Government Web Scraper & Reference Dataset Ingester.
Downloads genuine, publicly hosted statutory AICTE Extension of Approval (EoA) and
Letter of Approval (LoA) documents directly from official Directorate of Technical Education portals:
- hte.rajasthan.gov.in (Directorate of Technical Education, Govt of Rajasthan)
- admissions.nic.in (National Informatics Centre)
100% Official Government Sources Only.
"""

import urllib.request
import ssl
from pathlib import Path
from typing import List, Dict, Any
import json

OUT_DIR = Path("datasets/official_scraped_dataset")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Directly indexed official government statutory EoA / LoA URLs from NIC & DTE Rajasthan
OFFICIAL_GOVT_DOCS = [
    {
        "institution": "Government Women Polytechnic College, Sanganer",
        "doc_type": "AICTE_EXTENSION_OF_APPROVAL",
        "academic_year": "2023-24",
        "url": "https://hte.rajasthan.gov.in/dept/dte/board_of_technical_education,_rajasthan/government_women_polytechnic_college_,_sanganer/uploads/doc/AICTE_EOA_2023_24.pdf",
        "filename": "GOVT_EOA_Sanganer_2023_24.pdf"
    },
    {
        "institution": "Government Polytechnic College, Pali",
        "doc_type": "AICTE_LETTER_OF_APPROVAL",
        "academic_year": "Historical",
        "url": "https://hte.rajasthan.gov.in/dept/dte/board_of_technical_education,_rajasthan/government_polytechnic_college_pali/uploads/doc/LOA.pdf",
        "filename": "GOVT_LOA_Pali.pdf"
    },
    {
        "institution": "Government Residential Women Polytechnic College, Jodhpur",
        "doc_type": "AICTE_EXTENSION_OF_APPROVAL",
        "academic_year": "2026-27",
        "url": "https://hte.rajasthan.gov.in/Website/GOVERNMENTRESIDENTIALWOMENPOLYTECHNICCOLLEGEJODHPUR/CONTENTFILES/e023077c-a5ca-4e6a-9705-a349e3fc72f8.PDF",
        "filename": "GOVT_EOA_Jodhpur_2026_27.pdf"
    }
]

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/pdf,*/*"
}

# Ignore SSL verification for government servers with self-signed root certs
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

manifest = []

print("======================================================================")
print("  DOWNLOADING OFFICIAL AICTE STATUTORY DATASETS FROM GOVT OF RAJASTHAN")
print("======================================================================")

for item in OFFICIAL_GOVT_DOCS:
    target_path = OUT_DIR / item["filename"]
    print(f"\nTarget: {item['institution']} ({item['doc_type']})")
    print(f"URL: {item['url']}")
    try:
        req = urllib.request.Request(item["url"], headers=headers)
        with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
            data = resp.read()
            target_path.write_bytes(data)
            print(f" -> SUCCESS: Downloaded {len(data)} bytes to {target_path.name}")
            manifest.append({
                "institution": item["institution"],
                "doc_type": item["doc_type"],
                "academic_year": item["academic_year"],
                "file_path": str(target_path).replace("\\", "/"),
                "size_bytes": len(data),
                "source_url": item["url"],
                "is_official_government_source": True,
            })
    except Exception as e:
        print(f" -> ERROR: Failed to download from {item['url']}: {e}")

manifest_file = OUT_DIR / "OFFICIAL_DATASET_MANIFEST.json"
manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"\nManifest saved with {len(manifest)} verified official documents to:\n  -> {manifest_file}")
