#!/usr/bin/env python3
"""
backfill_contracts.py

Еднократен (но презапускаем) backfill на договорите от open-data емисията
на ЦАИС ЕОП (storage.eop.bg) за последните ~12 месеца назад.

Защо е направен така:
  - Записва ПО ЕДИН ФАЙЛ НА ДЕН в локалната папка eop_cache/. Ако скриптът
    се прекъсне (Ctrl+C, изгубена връзка), просто го пускаш пак -- вече
    изтеглените дни се прескачат, не се тeglят втори път.
  - Тегли само файла с ДОГОВОРИ за всеки ден (не tenders/annexes/OCDS) --
    това е достатъчно за сегашната risk score логика (offersCount,
    contractValue, typeOfContract, buyer/supplierRegisterNumber) и държи
    кеша по-малък.
  - В края слепва всички дневни файлове в един обединен data/cache.json,
    готов за score_contracts.py и за commit в repo-то.

Очаквано време: ~10-20 минути за 12 месеца назад, зависи от връзката.
Може спокойно да се прекъсва и пуска пак -- няма да тегли наново готовите дни.

Ползва само вградени Python модули -- не са нужни pip инсталации.
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
USER_AGENT = "gdprcheck-sigma-poc/0.1 (+https://gdprcheck.bg)"

CACHE_DIR = Path("eop_cache")              # по един файл на ден тук (resumable)
OUTPUT_FILE = Path("data") / "cache.json"  # обединен резултат накрая

DEFAULT_DAYS_BACK = 365
REQUEST_DELAY_SECONDS = 0.3   # учтива пауза между заявките към storage.eop.bg
MAX_RETRIES = 3


def daterange_back(days_back):
    """Връща списък от date обекти от вчера назад, по ред старо -> ново."""
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
                return None  # денят просто не е публикуван -- не е грешка
            if attempt == retries:
                print(f"  [{day}] HTTP грешка {e.code} след {retries} опита, пропускам.", file=sys.stderr)
                return None
        except urllib.error.URLError as e:
            if attempt == retries:
                print(f"  [{day}] мрежова грешка след {retries} опита: {e}", file=sys.stderr)
                return None
        time.sleep(1)
    return None


def find_contracts_key(keys):
    for k in keys:
        if "договор" in k.lower():
            return k
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
                print(f"  [{day}] грешка при изтегляне на {object_key}: {e}", file=sys.stderr)
                return None
            time.sleep(1)
    return None


def day_cache_path(day):
    return CACHE_DIR / f"contracts-{day.isoformat()}.json"


def backfill(days_back):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    days = daterange_back(days_back)
    total = len(days)

    already_cached = 0
    newly_fetched = 0
    no_bucket = 0
    no_contracts_file = 0
    failed = 0

    try:
        for i, day in enumerate(days, start=1):
            cache_path = day_cache_path(day)
            if cache_path.exists():
                already_cached += 1
                continue

            print(f"[{i}/{total}] {day.isoformat()} ...", end=" ")
            keys = list_bucket(day)
            if keys is None:
                print("няма публикуван bucket, пропускам.")
                no_bucket += 1
                continue

            contracts_key = find_contracts_key(keys)
            if not contracts_key:
                print("няма файл с договори в bucket-а, пропускам.")
                no_contracts_file += 1
                continue

            data = fetch_json(contracts_key, day)
            if data is None:
                failed += 1
                continue

            cache_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            print(f"OK ({len(data)} записа)")
            newly_fetched += 1
            time.sleep(REQUEST_DELAY_SECONDS)
    except KeyboardInterrupt:
        print("\n\nПрекъснато от теб (Ctrl+C). Кешираните дни до момента са запазени в "
              f"{CACHE_DIR}/ -- пусни скрипта пак, за да продължи оттам.")
        sys.exit(1)

    print("\n--- Обобщение на backfill-а ---")
    print(f"Общо дни в прозореца: {total}")
    print(f"Вече кеширани (прескочени тоя път): {already_cached}")
    print(f"Новоизтеглени тоя път: {newly_fetched}")
    print(f"Без публикуван bucket: {no_bucket}")
    print(f"Без файл с договори: {no_contracts_file}")
    print(f"Неуспешни (мрежови грешки): {failed}")


def merge_cache():
    """Слепва всички contracts-*.json файлове в eop_cache/ в един data/cache.json."""
    day_files = sorted(CACHE_DIR.glob("contracts-*.json"))
    if not day_files:
        print("Няма кеширани дни за сливане.")
        return

    all_contracts = []
    days_included = []
    for path in day_files:
        try:
            day_data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"  Прескачам повреден файл: {path.name}", file=sys.stderr)
            continue
        all_contracts.extend(day_data)
        days_included.append(path.stem.replace("contracts-", ""))

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generatedAt": date.today().isoformat(),
        "daysIncluded": len(days_included),
        "firstDay": min(days_included) if days_included else None,
        "lastDay": max(days_included) if days_included else None,
        "recordCount": len(all_contracts),
        "contracts": all_contracts,
    }
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    size_mb = OUTPUT_FILE.stat().st_size / (1024 * 1024)
    print(f"\nЗаписано: {OUTPUT_FILE}  ({len(all_contracts)} записа, "
          f"{len(days_included)} дни, {size_mb:.1f} MB)")


def main():
    parser = argparse.ArgumentParser(description="Backfill на договори от storage.eop.bg")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS_BACK,
                         help=f"Колко дни назад да тегли (по подразбиране {DEFAULT_DAYS_BACK})")
    parser.add_argument("--merge-only", action="store_true",
                         help="Само слей вече кешираните дни, без да тегли нови")
    args = parser.parse_args()

    if not args.merge_only:
        print(f"Backfill на договори от storage.eop.bg за последните {args.days} дни.")
        print(f"Кеш по дни: {CACHE_DIR}/   Обединен файл накрая: {OUTPUT_FILE}\n")
        backfill(args.days)

    print("\nСливам дневните файлове в един обединен кеш ...")
    merge_cache()


if __name__ == "__main__":
    main()
