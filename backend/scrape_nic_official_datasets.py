import urllib.request
import re
from pathlib import Path

out_dir = Path("datasets/official_scraped_dataset")
out_dir.mkdir(parents=True, exist_ok=True)

targets = [
    "https://admissions.nic.in/ACPC/applicant/root/Home.aspx",
    "https://gujacpc.admissions.nic.in/",
    "https://dte.assam.gov.in/",
    "https://dte.kerala.gov.in/"
]

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

downloaded = 0
for t in targets:
    try:
        print(f"\n--- Checking Official Govt Portal: {t} ---")
        req = urllib.request.Request(t, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            pdf_links = re.findall(r'href=[\'"]([^\'"]+\.pdf[^\'"]*)[\'"]', html, re.I)
            print(f"Found {len(pdf_links)} PDF references")
            for link in pdf_links[:4]:
                if not link.startswith("http"):
                    base = t.rstrip("/")
                    link = f"{base}/{link.lstrip('/')}"
                clean_name = Path(link.split("?")[0]).name
                if not clean_name.endswith(".pdf"):
                    clean_name += ".pdf"
                dest = out_dir / clean_name
                try:
                    p_req = urllib.request.Request(link, headers=headers)
                    with urllib.request.urlopen(p_req, timeout=12) as p_resp:
                        data = p_resp.read()
                        if len(data) > 1024:
                            dest.write_bytes(data)
                            print(f" -> Downloaded: {clean_name} ({len(data)} bytes)")
                            downloaded += 1
                except Exception as ex:
                    print(f" -> Skip {clean_name}: {ex}")
    except Exception as e:
        print(f"Connection error to {t}: {e}")

print(f"\nTotal official government PDFs downloaded: {downloaded}")
