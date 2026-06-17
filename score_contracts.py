#!/usr/bin/env python3
"""
score_contracts.py

Чете data/cache.json, изчислява risk score за всеки договор
и записва топ 20 в data/top20.json за сайта.

Risk score сигнали:
  +40  единична оферта (offersCount == 1)
  +30  стойност над медианата за типа договор
  +30  изпълнителят печели 5+ поръчки от същия възложител
"""

import json
import statistics
from pathlib import Path
from collections import defaultdict

CACHE_FILE = Path("data") / "cache.json"
OUTPUT_FILE = Path("data") / "top20.json"

EUR_TO_BGN = 1.95583

def to_bgn(value, currency):
    if currency == "EUR":
        return value * EUR_TO_BGN
    return value
def parse_value(raw):
    """Превръща '2600,00' в float 2600.0"""
    if not raw:
        return 0.0
    try:
        return float(str(raw).replace(",", ".").replace(" ", ""))
    except ValueError:
        return 0.0


def compute_scores(contracts):
    # --- Медиана по тип договор ---
    values_by_type = defaultdict(list)
    for c in contracts:
        v = parse_value(c.get("contractValue"))
        t = c.get("typeOfContract", "Друго")
        if v > 0:
            values_by_type[t].append(v)

    median_by_type = {
        t: statistics.median(vals)
        for t, vals in values_by_type.items()
        if vals
    }

    # --- Брой победи на изпълнител при същия възложител ---
    pair_counts = defaultdict(int)
    for c in contracts:
        supplier = c.get("supplierRegisterNumber") or ""
        buyer = c.get("buyerRegistryNumber") or ""
        if supplier and buyer:
            pair_counts[(supplier, buyer)] += 1

    # --- Scoring ---
    scored = []
    for c in contracts:
        score = 0
        flags = []

        # Сигнал 1: единична оферта
        offers = c.get("offersCount")
        try:
            offers_int = int(offers)
        except (TypeError, ValueError):
            offers_int = 0

        if offers_int == 1:
            score += 40
            flags.append("Единствена оферта")

        # Сигнал 2: стойност над медианата
        value = parse_value(c.get("contractValue"))
        contract_type = c.get("typeOfContract", "Друго")
        median = median_by_type.get(contract_type, 0)
        if value > 0 and median > 0 and value > median:
            score += 30
            flags.append(f"Стойност над медианата ({median:,.0f} лв.)")

        # Сигнал 3: концентрация при възложител
        supplier = c.get("supplierRegisterNumber") or ""
        buyer = c.get("buyerRegistryNumber") or ""
        wins = pair_counts.get((supplier, buyer), 0)
        if wins >= 5:
            score += 30
            flags.append(f"Изпълнителят е спечелил {wins} поръчки от същия възложител")

        if score > 0:
            scored.append({
                "score": score,
                "flags": flags,
                "contractNumber": c.get("contractNumber"),
                "contractDate": c.get("contractDate"),
                "contractValue": value,
                "contractCurrency": c.get("contractCurrency", "BGN"),
                "tenderName": c.get("tenderName"),
                "buyerName": c.get("buyerName"),
                "supplierName": c.get("supplierName"),
                "procedureType": c.get("procedureType"),
                "typeOfContract": contract_type,
                "offersCount": offers_int,
                "linkToOjEu": c.get("linkToOjEu", ""),
                "publicationDate": c.get("publicationDate", ""),
            })

    scored.sort(key=lambda x: (x["score"], to_bgn(x["contractValue"], x["contractCurrency"])), reverse=True)
    return scored[:20]


def main():
    print(f"Зареждам {CACHE_FILE} ...")
    raw = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    contracts = raw.get("contracts", [])
    print(f"Заредени {len(contracts)} записа.")

    top20 = compute_scores(contracts)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps({"generatedAt": raw.get("lastDay"), "top20": top20},
                   ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"\nТоп 20 записани в {OUTPUT_FILE}\n")
    for i, c in enumerate(top20, 1):
        print(f"{i:2}. [{c['score']:3}/100] {c['buyerName'][:40]}")
        print(f"     {c['supplierName']} — {c['contractValue']:,.0f} {c['contractCurrency']}")
        print(f"     Флагове: {', '.join(c['flags'])}")
        print()


if __name__ == "__main__":
    main()