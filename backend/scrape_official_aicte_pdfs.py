import urllib.request
import re
from pathlib import Path

out_dir = Path("datasets/official_scraped_dataset")
out_dir.mkdir(parents=True, exist_ok=True)

url = "https://www.aicte.gov.in/bulletins/circulars"
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

print(f"Scraping official government circulars from: {url}")
try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=12) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
        pattern = re.compile(r'href=[\'"]([^\'"]+\.pdf)[\'"]', re.IGNORECASE)
        matches = pattern.findall(html)
        print(f"Total PDF links discovered: {len(matches)}")
        
        count = 0
        for m in matches:
            pdf_url = m if m.startswith("http") else f"https://www.aicte.gov.in{m if m.startswith('/') else '/' + m}"
            filename = Path(pdf_url).name
            target = out_dir / filename
            try:
                print(f"Downloading [{count+1}]: {filename}...")
                p_req = urllib.request.Request(pdf_url, headers=headers)
                with urllib.request.urlopen(p_req, timeout=15) as p_resp:
                    content = p_resp.read()
                    target.write_bytes(content)
                    print(f" -> Saved {filename} ({len(content)} bytes)")
                    count += 1
                    if count >= 10:
                        break
            except Exception as ex:
                print(f" -> Skip {filename}: {ex}")
except Exception as e:
    print(f"Connection error to {url}: {e}")
