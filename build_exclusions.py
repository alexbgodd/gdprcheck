#!/usr/bin/env python3
"""
build_exclusions.py

Анализира data/cache.json и идентифицира:
1. Монополни доставчици (>80% от поръчките им са с единствена оферта)
2. Държавни дружества (по ключови думи в името)

Записва data/known_monopolies.json
"""

import json
from pathlib import Path
from collections import defaultdict

CACHE_FILE = Path("data") / "cache.json"
OUTPUT_FILE = Path("data") / "known_monopolies.json"

MONOPOLY_THRESHOLD = 0.80  # 80%+ единствени оферти = монополен доставчик
MIN_CONTRACTS = 3  # минимум поръчки за да се класифицира

STATE_KEYWORDS = [
    "ЕАД", "държавна", "държавен", "национална компания",
    "национален", "министерство", "агенция", "община",
    "болница", "университет", "академия", "институт",
    "АЕЦ", "ЧЕЗ", "EVN", "TOПЛОФИКАЦИЯ", "водоснабдяване",
    "електроразпределение", "НЕК", "БДЖ", "летище"
]


def is_state_entity(name):
    if not name:
        return False
    name_lower = name.lower()
    return any(kw.lower() in name_lower for kw in STATE_KEYWORDS)


def main():
    print(f"Зареждам {CACHE_FILE} ...")
    raw = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    contracts = raw.get("contracts", [])
    print(f"Анализирам {len(contracts)} записа...")

    # Събираме статистика по изпълнител
    supplier_stats = defaultdict(lambda: {"total": 0, "single_offer": 0, "name": ""})

    for c in contracts:
        reg = c.get("supplierRegisterNumber") or ""
        name = c.get("supplierName") or ""
        if not reg:
            continue

        supplier_stats[reg]["total"] += 1
        supplier_stats[reg]["name"] = name

        try:
            offers = int(c.get("offersCount") or 0)
        except (ValueError, TypeError):
            offers = 0

        if offers == 1:
            supplier_stats[reg]["single_offer"] += 1

    # Класифицираме
    monopolies = {}
    state_entities = {}

    for reg, stats in supplier_stats.items():
        total = stats["total"]
        single = stats["single_offer"]
        name = stats["name"]

        if total < MIN_CONTRACTS:
            continue

        ratio = single / total

        if is_state_entity(name):
            state_entities[reg] = {
                "name": name,
                "total_contracts": total,
                "single_offer_ratio": round(ratio, 2),
                "reason": "Държавно/публично дружество"
            }
        elif ratio >= MONOPOLY_THRESHOLD:
            monopolies[reg] = {
                "name": name,
                "total_contracts": total,
                "single_offer_ratio": round(ratio, 2),
                "reason": f"Монополен доставчик ({round(ratio*100)}% единствени оферти)"
            }

    result = {
        "generatedAt": raw.get("lastDay"),
        "state_entities": state_entities,
        "monopolies": monopolies,
        "summary": {
            "total_suppliers_analyzed": len(supplier_stats),
            "state_entities_found": len(state_entities),
            "monopolies_found": len(monopolies)
        }
    }

    OUTPUT_FILE.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"\n--- Резултат ---")
    print(f"Анализирани доставчици: {len(supplier_stats)}")
    print(f"Държавни/публични: {len(state_entities)}")
    print(f"Монополни доставчици: {len(monopolies)}")
    print(f"\nЗаписано в {OUTPUT_FILE}")

    print("\nПримери монополни доставчици:")
    for reg, info in list(monopolies.items())[:5]:
        print(f"  {info['name']} — {info['reason']}")

    print("\nПримери държавни дружества:")
    for reg, info in list(state_entities.items())[:5]:
        print(f"  {info['name']}")


if __name__ == "__main__":
    main()