#!/usr/bin/env python3
"""
score_contracts.py

Изчислява риск-скор за обществени поръчки.

Сигнали:
  +40  Единствена оферта
  +30  Стойност над медианата за типа поръчка (BGN)
  +15  Изпълнителят е спечелил 5-9 поръчки от същия възложител
  +30  Изпълнителят е спечелил 10+ поръчки от същия възложител
  +30  Стойността е нараснала >50% чрез анекс след подписване
  -30  Публично/държавно дружество
  -20  Монополен доставчик
"""

import json
import statistics
from pathlib import Path
from collections import defaultdict

CACHE_FILE      = Path("data") / "cache.json"
ANNEXES_FILE    = Path("data") / "annexes_cache.json"
EXCLUSIONS_FILE = Path("data") / "known_monopolies.json"
OUTPUT_FILE     = Path("data") / "top20.json"

EUR_TO_BGN = 1.95583
ANNEX_INFLATION_THRESHOLD = 0.50   # >50% увеличение = сигнал


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


def load_annex_inflation():
    """
    Връща речник:  contract_number → максимален % увеличение от анекси.

    Поддържа полета в camelCase и snake_case (двата формата се срещат в eop.bg):
      contractNumber / contract_number
      valueBefore / value_before
      valueAfter  / value_after
      deltaValue  / delta_value
      currency
    """
    if not ANNEXES_FILE.exists():
        return {}

    raw = json.loads(ANNEXES_FILE.read_text(encoding="utf-8"))
    annexes = raw.get("annexes", raw) if isinstance(raw, dict) else raw

    # Натрупваме delta_bgn по contractNumber
    deltas_by_contract = defaultdict(float)
    before_by_contract = defaultdict(float)

    def get(rec, *keys):
        for k in keys:
            v = rec.get(k)
            if v is not None:
                return v
        return None

    for a in annexes:
        if not isinstance(a, dict):
            continue
        cn = get(a, "contractNumber", "contract_number", "noticeId")
        if not cn:
            continue

        currency = get(a, "currency", "Currency") or "BGN"

        before = parse_value(get(a, "valueBefore", "value_before", "ValueBefore"))
        after  = parse_value(get(a, "valueAfter",  "value_after",  "ValueAfter"))
        delta  = parse_value(get(a, "deltaValue",  "delta_value",  "DeltaValue"))

        # Предпочитаме директния delta; ако липсва — изчисляваме
        if delta == 0 and after > before > 0:
            delta = after - before

        if delta <= 0:
            continue

        delta_bgn = to_bgn(delta, currency)
        deltas_by_contract[cn] += delta_bgn

        before_bgn = to_bgn(before, currency)
        if before_bgn > 0:
            before_by_contract[cn] = max(before_by_contract[cn], before_bgn)

    # Изчисляваме максималния % увеличение
    inflation = {}
    for cn, total_delta_bgn in deltas_by_contract.items():
        before_bgn = before_by_contract.get(cn, 0)
        if before_bgn > 0:
            pct = total_delta_bgn / before_bgn
            inflation[cn] = pct
        else:
            # Нямаме "преди" — консервативно не добавяме сигнал
            pass

    return inflation


def compute_scores(contracts, state_entities, monopolies, annex_inflation):
    # Медианата се изчислява в BGN (EUR се конвертира)
    values_by_type = defaultdict(list)
    for c in contracts:
        v = parse_value(c.get("contractValue"))
        currency = c.get("contractCurrency", "BGN")
        v_bgn = to_bgn(v, currency)
        t = c.get("typeOfContract", "Друго")
        if v_bgn > 0:
            values_by_type[t].append(v_bgn)

    median_by_type = {
        t: statistics.median(vals)
        for t, vals in values_by_type.items() if vals
    }

    pair_counts = defaultdict(int)
    for c in contracts:
        supplier = c.get("supplierRegisterNumber") or ""
        buyer    = c.get("buyerRegistryNumber") or ""
        if supplier and buyer:
            pair_counts[(supplier, buyer)] += 1

    scored = []
    for c in contracts:
        score  = 0
        flags  = []
        supplier_reg = c.get("supplierRegisterNumber") or ""

        if supplier_reg in state_entities:
            supplier_category = "state"
        elif supplier_reg in monopolies:
            supplier_category = "monopoly"
        else:
            supplier_category = "normal"

        # --- Сигнал 1: единствена оферта ---
        try:
            offers_int = int(c.get("offersCount") or 0)
        except (TypeError, ValueError):
            offers_int = 0

        if offers_int == 1:
            score += 40
            flags.append("Единствена оферта")

        # --- Сигнал 2: стойност над медианата ---
        value         = parse_value(c.get("contractValue"))
        currency      = c.get("contractCurrency", "BGN")
        value_bgn     = to_bgn(value, currency)
        contract_type = c.get("typeOfContract", "Друго")
        median        = median_by_type.get(contract_type, 0)
        if value_bgn > 0 and median > 0 and value_bgn > median:
            score += 30
            flags.append(f"Стойност над медианата ({median:,.0f} лв.)")

        # --- Сигнал 3: концентрация на поръчки ---
        supplier = c.get("supplierRegisterNumber") or ""
        buyer    = c.get("buyerRegistryNumber") or ""
        wins     = pair_counts.get((supplier, buyer), 0)
        if wins >= 10:
            score += 30
            flags.append(f"Изпълнителят е спечелил {wins} поръчки от същия възложител")
        elif wins >= 5:
            score += 15
            flags.append(f"Изпълнителят е спечелил {wins} поръчки от същия възложител")

        # --- Сигнал 4: раздута стойност чрез анекс ---
        cn  = c.get("contractNumber") or c.get("noticeId") or ""
        upn = c.get("uniqueProcurementNumber") or ""
        inflation_pct = annex_inflation.get(cn) or annex_inflation.get(upn) or 0
        if inflation_pct > ANNEX_INFLATION_THRESHOLD:
            score += 30
            flags.append(
                f"Стойността е нараснала с {inflation_pct*100:.0f}% чрез анекс"
            )

        # --- Корекции за монополни/държавни ---
        if supplier_category == "state":
            score = max(0, score - 30)
            flags.append("Публично/държавно дружество")
        elif supplier_category == "monopoly":
            score = max(0, score - 20)
            flags.append("Монополен доставчик")

        if score > 0:
            scored.append({
                "score":                 score,
                "flags":                 flags,
                "supplierCategory":      supplier_category,
                "contractNumber":        c.get("contractNumber"),
                "contractDate":          c.get("contractDate"),
                "contractValue":         value,
                "contractValueBgn":      round(value_bgn, 2),
                "contractCurrency":      currency,
                "tenderName":            c.get("tenderName"),
                "buyerName":             c.get("buyerName"),
                "buyerRegistryNumber":   c.get("buyerRegistryNumber", ""),
                "supplierName":          c.get("supplierName"),
                "supplierRegisterNumber": supplier_reg,
                "procedureType":         c.get("procedureType"),
                "typeOfContract":        contract_type,
                "offersCount":           offers_int,
                "annexInflationPct":     round(inflation_pct * 100, 1) if inflation_pct else None,
                "linkToOjEu":            c.get("linkToOjEu", ""),
                "publicationDate":       c.get("publicationDate", ""),
            })

    scored.sort(key=lambda x: (x["score"], x["contractValueBgn"]), reverse=True)

    # Tier-базирана селекция: до 50 от всяко score ниво, max 300
    PER_TIER = 50
    by_score = defaultdict(list)
    for item in scored:
        by_score[item["score"]].append(item)
    result = []
    for score_val in sorted(by_score.keys(), reverse=True):
        result.extend(by_score[score_val][:PER_TIER])
        if len(result) >= 300:
            break
    return result


def main():
    print(f"Зареждам {CACHE_FILE} ...")
    raw       = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    contracts = raw.get("contracts", [])
    print(f"Заредени {len(contracts)} записа.")

    state_entities, monopolies = load_exclusions()
    print(f"Exclusions: {len(state_entities)} държавни, {len(monopolies)} монополни")

    annex_inflation = load_annex_inflation()
    if annex_inflation:
        print(f"Анекси с >0% увеличение: {len(annex_inflation)}")
    else:
        print(f"Анекси: не е намерен {ANNEXES_FILE} или е празен (само договори)")

    results = compute_scores(contracts, state_entities, monopolies, annex_inflation)

    OUTPUT_FILE.write_text(
        json.dumps(
            {"generatedAt": raw.get("lastDay"), "contracts": results},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    from collections import Counter
    dist = Counter(c["score"] for c in results)
    print(f"\nЗаписани {len(results)} записа в {OUTPUT_FILE}")
    print("Score разпределение:")
    for s, n in sorted(dist.items(), reverse=True):
        print(f"  {s:3}/100 -> {n}")
    print()
    for i, c in enumerate(results[:10], 1):
        print(f"{i:2}. [{c['score']:3}/100] {(c['buyerName'] or '')[:45]}")
        print(f"     {c['supplierName']} -- {c['contractValue']:,.0f} {c['contractCurrency']}")
        print(f"     {', '.join(c['flags'])}")


if __name__ == "__main__":
    main()
