#!/usr/bin/env python3
import json
import statistics
from pathlib import Path
from collections import defaultdict

CACHE_FILE = Path("data") / "cache.json"
EXCLUSIONS_FILE = Path("data") / "known_monopolies.json"
OUTPUT_FILE = Path("data") / "top20.json"

EUR_TO_BGN = 1.95583

def to_bgn(value, currency):
    if currency == "EUR":
        return value * EUR_TO_BGN
    return value

def parse_value(raw):
    if not raw:
        return 0.0
    try:
        return float(str(raw).replace(",", ".").replace(" ", ""))
    except ValueError:
        return 0.0

def load_exclusions():
    if not EXCLUSIONS_FILE.exists():
        return {}, {}
    data = json.loads(EXCLUSIONS_FILE.read_text(encoding="utf-8"))
    return data.get("state_entities", {}), data.get("monopolies", {})

def compute_scores(contracts, state_entities, monopolies):
    values_by_type = defaultdict(list)
    for c in contracts:
        v = parse_value(c.get("contractValue"))
        t = c.get("typeOfContract", "Друго")
        if v > 0:
            values_by_type[t].append(v)

    median_by_type = {
        t: statistics.median(vals)
        for t, vals in values_by_type.items() if vals
    }

    pair_counts = defaultdict(int)
    for c in contracts:
        supplier = c.get("supplierRegisterNumber") or ""
        buyer = c.get("buyerRegistryNumber") or ""
        if supplier and buyer:
            pair_counts[(supplier, buyer)] += 1

    scored = []
    for c in contracts:
        score = 0
        flags = []
        supplier_reg = c.get("supplierRegisterNumber") or ""

        # Категория на доставчика
        if supplier_reg in state_entities:
            supplier_category = "state"
        elif supplier_reg in monopolies:
            supplier_category = "monopoly"
        else:
            supplier_category = "normal"

        # Сигнал 1: единствена оферта
        try:
            offers_int = int(c.get("offersCount") or 0)
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

        # Сигнал 3: концентрация
        supplier = c.get("supplierRegisterNumber") or ""
        buyer = c.get("buyerRegistryNumber") or ""
        wins = pair_counts.get((supplier, buyer), 0)
        if wins >= 5:
            score += 30
            flags.append(f"Изпълнителят е спечелил {wins} поръчки от същия възложител")

        # Намаление за монополни/държавни
        if supplier_category == "state":
            score = max(0, score - 30)
            flags.append("⚠️ Публично/държавно дружество")
        elif supplier_category == "monopoly":
            score = max(0, score - 20)
            flags.append("⚠️ Монополен доставчик")

        if score > 0:
            scored.append({
                "score": score,
                "flags": flags,
                "supplierCategory": supplier_category,
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
    return scored[:50]  # Връщаме 50, филтрирането е в сайта

def main():
    print(f"Зареждам {CACHE_FILE} ...")
    raw = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    contracts = raw.get("contracts", [])
    print(f"Заредени {len(contracts)} записа.")

    state_entities, monopolies = load_exclusions()
    print(f"Exclusions: {len(state_entities)} държавни, {len(monopolies)} монополни")

    top50 = compute_scores(contracts, state_entities, monopolies)

    OUTPUT_FILE.write_text(
        json.dumps({"generatedAt": raw.get("lastDay"), "contracts": top50},
                   ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"\nТоп 50 записани в {OUTPUT_FILE}\n")
    for i, c in enumerate(top50[:10], 1):
        print(f"{i:2}. [{c['score']:3}/100] {c['buyerName'][:45]}")
        print(f"     {c['supplierName']} — {c['contractValue']:,.0f} {c['contractCurrency']}")
        print(f"     {', '.join(c['flags'])}")

if __name__ == "__main__":
    main()