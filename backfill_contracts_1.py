#!/usr/bin/env python3
"""
backfill_contracts_1.py

Тегли договори, анекси и тръжни досиета от storage.eop.bg (ЦАИС ЕОП).
Resumable — вече изтеглените дни се прескачат.

Изход:
  eop_cache/contracts-YYYY-MM-DD.json   (договори)
  eop_cache/annexes-YYYY-MM-DD.json     (анекси/изменения)
  eop_cache/tenders-YYYY-MM-DD.json     (тръжни досиета)

  data/cache.json           — обединени договори
  data/annexes_cache.json   — обединени анекси
  data/tenders_cache.json   — обединени тръжни досиета
"""

import argparse
import sys
import json
import time
import urllib.request
import urllib.error
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path

BASE_URL = "https://storage.eop.bg"
S3_NS = "{http://s3.amazonaws.com/doc/2006-03-01/}"
USER_AGENT = "gdprcheck-sigma-poc/0.2 (+https://gdprcheck.bg)"

CACHE_DIR = Path("eop_cache")
OUTPUT_CONTRACTS = Path("data") / "cache.json"
OUTPUT_ANNEXES   = Path("data") / "annexes_cache.json"
OUTPUT_TENDERS   = Path("data") / "tenders_cache.json"

DEFAULT_DAYS_BACK = 365
REQUEST_DELAY_SECONDS = 0.3
MAX_RETRIES = 3


def daterange_back(days_back):
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=days_back)
    days = []
    d = start
    while d <= end:
        days.append(d)
        d += timedelta(days=1)
    return days


def list_bucket(day, retries=MAX_RETRIES):
    bucket_url = f"{BASE_URL}/open-data-{day.isoformat()}/"
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(bucket_url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                xml_bytes = resp.read()
            root = ET.fromstring(xml_bytes)
            return [el.text for el in root.iter(f"{S3_NS}Key")]
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None
            if attempt == retries:
                print(f"  [{day}] HTTP {e.code} след {retries} опита.", file=sys.stderr)
                return None
        except urllib.error.URLError as e:
            if attempt == retries:
                print(f"  [{day}] Мрежова грешка: {e}", file=sys.stderr)
                return None
        time.sleep(1)
    return None


def classify_key(key):
    """Класифицира S3 ключ по тип файл."""
    low = key.lower()
    if "договор" in low:
        return "contracts"
    if "анекс" in low or "annex" in low or "изменени" in low:
        return "annexes"
    if "тръжни" in low or "търг" in low or "tender" in low or "процедур" in low:
        return "tenders"
    return None


def fetch_json(object_key, day, retries=MAX_RETRIES):
    encoded_key = urllib.parse.quote(object_key)
    url = f"{BASE_URL}/open-data-{day.isoformat()}/{encoded_key}"
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            if attempt == retries:
                print(f"  [{day}] Грешка при {object_key}: {e}", file=sys.stderr)
                return None
            time.sleep(1)
    return None


def day_cache_path(day, kind):
    return CACHE_DIR / f"{kind}-{day.isoformat()}.json"


def backfill(days_back):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    days = daterange_back(days_back)
    total = len(days)

    stats = {"cached": 0, "fetched": 0, "no_bucket": 0, "failed": 0}

    try:
        for i, day in enumerate(days, start=1):
            # Ако всичките 3 вида вече са кеширани — прескочи деня
            all_cached = all(day_cache_path(day, k).exists() for k in ("contracts", "annexes", "tenders"))
            if all_cached:
                stats["cached"] += 1
                continue

            print(f"[{i}/{total}] {day.isoformat()} ...", end=" ", flush=True)
            keys = list_bucket(day)
            if keys is None:
                print("няма bucket.")
                stats["no_bucket"] += 1
                continue

            # Класифицирай наличните ключове
            by_type = {}
            for k in keys:
                t = classify_key(k)
                if t and t not in by_type:
                    by_type[t] = k

            fetched_types = []
            failed_types = []
            for kind in ("contracts", "annexes", "tenders"):
                cache_path = day_cache_path(day, kind)
                if cache_path.exists():
                    continue
                if kind not in by_type:
                    # Файлът липсва за деня — запиши празен списък
                    cache_path.write_text("[]", encoding="utf-8")
                    continue
                data = fetch_json(by_type[kind], day)
                if data is None:
                    failed_types.append(kind)
                    continue
                records = data if isinstance(data, list) else data.get("contracts", data.get("items", [data]))
                cache_path.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
                fetched_types.append(f"{kind}({len(records)})")

            if failed_types:
                print(f"ГРЕШКА в {failed_types}")
                stats["failed"] += 1
            else:
                print(f"OK {' '.join(fetched_types) or '(без нови)'}")
                stats["fetched"] += 1

            time.sleep(REQUEST_DELAY_SECONDS)

    except KeyboardInterrupt:
        print(f"\n\nПрекъснато. Кешираните дни са в {CACHE_DIR}/")
        sys.exit(1)

    print("\n--- Backfill обобщение ---")
    print(f"Вече кеширани:  {stats['cached']}")
    print(f"Новоизтеглени:  {stats['fetched']}")
    print(f"Без bucket:     {stats['no_bucket']}")
    print(f"Грешки:         {stats['failed']}")


def merge_cache():
    """Слепва дневните файлове в 3 обединени cache файла."""
    day_files = sorted(CACHE_DIR.glob("contracts-*.json"))
    if not day_files:
        print("Няма кеширани дни.")
        return

    OUTPUT_CONTRACTS.parent.mkdir(parents=True, exist_ok=True)

    contracts, annexes, tenders = [], [], []
    days_included = []

    for path in day_files:
        day_str = path.stem.replace("contracts-", "")
        try:
            contracts.extend(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            print(f"  Пропускам повреден файл: {path.name}", file=sys.stderr)
            continue

        for kind, lst in (("annexes", annexes), ("tenders", tenders)):
            p = CACHE_DIR / f"{kind}-{day_str}.json"
            if p.exists():
                try:
                    lst.extend(json.loads(p.read_text(encoding="utf-8")))
                except json.JSONDecodeError:
                    pass

        days_included.append(day_str)

    meta = {
        "generatedAt": date.today().isoformat(),
        "daysIncluded": len(days_included),
        "firstDay": min(days_included) if days_included else None,
        "lastDay": max(days_included) if days_included else None,
    }

    OUTPUT_CONTRACTS.write_text(
        json.dumps({**meta, "recordCount": len(contracts), "contracts": contracts},
                   ensure_ascii=False),
        encoding="utf-8"
    )
    OUTPUT_ANNEXES.write_text(
        json.dumps({**meta, "recordCount": len(annexes), "annexes": annexes},
                   ensure_ascii=False),
        encoding="utf-8"
    )
    OUTPUT_TENDERS.write_text(
        json.dumps({**meta, "recordCount": len(tenders), "tenders": tenders},
                   ensure_ascii=False),
        encoding="utf-8"
    )

    print(f"\nДоговори:  {len(contracts):>7} → {OUTPUT_CONTRACTS}")
    print(f"Анекси:    {len(annexes):>7} → {OUTPUT_ANNEXES}")
    print(f"Тендери:   {len(tenders):>7} → {OUTPUT_TENDERS}")
    print(f"Период:    {meta['firstDay']} → {meta['lastDay']} ({len(days_included)} дни)")


def main():
    parser = argparse.ArgumentParser(description="Backfill от storage.eop.bg")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS_BACK,
                        help=f"Дни назад (по подразбиране {DEFAULT_DAYS_BACK})")
    parser.add_argument("--merge-only", action="store_true",
                        help="Само слей, без да тегли нови дни")
    args = parser.parse_args()

    if not args.merge_only:
        print(f"Backfill: последните {args.days} дни | договори + анекси + тендери")
        print(f"Кеш: {CACHE_DIR}/   Изход: {OUTPUT_CONTRACTS.parent}/\n")
        backfill(args.days)

    print("\nСливам дневните файлове ...")
    merge_cache()


if __name__ == "__main__":
    main()
