#!/usr/bin/env python3
"""
update_dashboard.py

Regenerates data/dashboard_data.js for the True North HTML dashboard
from a fresh "Master Data" export (CSV or XLSX with the same columns
as the original Power BI table).

USAGE
    python update_dashboard.py --input "Master Data Export.xlsx" --output ../data/dashboard_data.js

The script:
  1. Reads the latest source data (CSV or Excel)
  2. Validates that required columns are present
  3. Cleans / normalizes fields (dates, missing values)
  4. Dictionary-encodes categorical columns to keep the JSON payload small
  5. Writes dashboard_data.json
  6. Prints a validation summary (row count, date range, per-column nulls)

Do not edit the dashboard UI (index.html / app.js / style.css) as part of
a monthly refresh -- this script only ever touches dashboard_data.json.
"""

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

# Source column name -> internal field name used by the dashboard.
# If the client renames a column in their export, update this mapping only.
COLUMN_MAP = {
    "Client": "client",
    "Date (Created)": "date",
    "Category": "category",
    "Contact Type": "contactType",
    "Solution": "solution",
    "Mailbox 2": "mailbox",
    "Quarter": "quarter",
    "Ticket ID": "ticketId",
}

CATEGORICAL_FIELDS = ["client", "category", "contactType", "solution", "mailbox", "quarter"]
DATE_BASE = pd.Timestamp("2018-01-01")  # offsets are stored as days since this date


def load_source(path: Path) -> pd.DataFrame:
    if path.suffix.lower() in (".xlsx", ".xls"):
        return pd.read_excel(path)
    return pd.read_csv(path)


def validate_columns(df: pd.DataFrame) -> list[str]:
    missing = [c for c in COLUMN_MAP if c not in df.columns]
    return missing


def normalize_categorical(series: pd.Series) -> tuple[pd.Series, list[str]]:
    """Merges values that only differ by case or leading/trailing whitespace
    (e.g. "Phone" / "phone", "QCR Holdings" / "QCR holding") into a single
    value. The most frequently occurring original spelling/casing is kept
    as the display label, so "Phone" (common) wins over "phone" (rare)
    rather than always picking whichever sorts first alphabetically.

    Returns the remapped series plus a list of human-readable merge notes
    for the refresh summary, so merges are visible, not silent.
    """
    non_null = series.dropna().astype(str).str.strip()
    if non_null.empty:
        return series, []

    counts = non_null.value_counts()  # exact-string counts, original casing preserved
    key_of = lambda v: v.casefold()

    canonical = {}          # casefold key -> chosen display label
    groups = {}             # casefold key -> list of (label, count) that collapsed together
    for label, count in counts.items():
        key = key_of(label)
        groups.setdefault(key, []).append((label, count))

    notes = []
    for key, variants in groups.items():
        variants.sort(key=lambda lc: -lc[1])  # most frequent first
        winner = variants[0][0]
        canonical[key] = winner
        if len(variants) > 1:
            merged_from = ", ".join(f'"{v}" ({c})' for v, c in variants[1:])
            notes.append(f'merged {merged_from} -> "{winner}"')

    def remap(v):
        if pd.isna(v):
            return None
        return canonical[key_of(str(v).strip())]

    return series.map(remap), notes


def build_payload(df: pd.DataFrame, source_name: str) -> dict:
    trimmed = df[list(COLUMN_MAP.keys())].rename(columns=COLUMN_MAP)
    trimmed["date"] = pd.to_datetime(trimmed["date"], errors="coerce")

    bad_dates = trimmed["date"].isna().sum()
    if bad_dates:
        print(f"WARNING: {bad_dates} row(s) had an unparseable Date (Created) and were dropped.")
        trimmed = trimmed.dropna(subset=["date"])

    dicts, encoded, merge_notes = {}, {}, {}
    for col in CATEGORICAL_FIELDS:
        cleaned, notes = normalize_categorical(trimmed[col])
        trimmed[col] = cleaned
        merge_notes[col] = notes

        series = trimmed[col]
        is_na = series.isna()
        values = sorted(series[~is_na].astype(str).unique().tolist())
        index = {v: i for i, v in enumerate(values)}
        dicts[col] = values
        encoded[col] = [
            index[str(v)] if not na else None
            for v, na in zip(series.tolist(), is_na.tolist())
        ]

    date_offsets = (trimmed["date"] - DATE_BASE).dt.days.astype(int).tolist()

    ticket_series = trimmed["ticketId"]
    ticket_na = ticket_series.isna()
    ticket_ids = [
        int(v) if not na else None
        for v, na in zip(ticket_series.tolist(), ticket_na.tolist())
    ]

    rows = []
    for i in range(len(trimmed)):
        rows.append([
            encoded["client"][i],
            date_offsets[i],
            encoded["category"][i],
            encoded["contactType"][i],
            encoded["solution"][i],
            encoded["mailbox"][i],
            encoded["quarter"][i],
            ticket_ids[i],
        ])

    return {
        "meta": {
            "generatedAt": pd.Timestamp.now().strftime("%Y-%m-%d"),
            "sourceFile": source_name,
            "rowCount": len(rows),
            "dateBase": DATE_BASE.strftime("%Y-%m-%d"),
            "columns": ["client", "dateOffset", "category", "contactType",
                        "solution", "mailbox", "quarter", "ticketId"],
        },
        "dicts": dicts,
        "rows": rows,
        "_mergeNotes": merge_notes,  # consumed by print_summary only, not by the dashboard
    }


def print_summary(df: pd.DataFrame, payload: dict) -> None:
    print("\n=== Validation summary ===")
    print(f"Rows written:      {payload['meta']['rowCount']}")
    print(f"Date range:        {df['Date (Created)'].min()} -> {df['Date (Created)'].max()}")
    for col, source_col in [
        ("client", "Client"), ("category", "Category"), ("contactType", "Contact Type"),
        ("solution", "Solution"), ("mailbox", "Mailbox 2"), ("quarter", "Quarter"),
    ]:
        n_missing = df[source_col].isna().sum()
        n_distinct = len(payload["dicts"][col])
        print(f"  {source_col:<15} distinct={n_distinct:<6} missing={n_missing}")

    any_merges = any(payload["_mergeNotes"].values())
    if any_merges:
        print("\n=== Case/whitespace duplicates merged this run ===")
        for col, notes in payload["_mergeNotes"].items():
            for note in notes:
                print(f"  [{col}] {note}")
    else:
        print("\nNo case/whitespace duplicate values found this run.")


def main():
    parser = argparse.ArgumentParser(description="Rebuild dashboard_data.js from a fresh export.")
    parser.add_argument("--input", required=True, help="Path to the source CSV/XLSX export")
    parser.add_argument("--output", default="../data/dashboard_data.js", help="Output JS path")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        sys.exit(f"ERROR: input file not found: {input_path}")

    df = load_source(input_path)

    missing_cols = validate_columns(df)
    if missing_cols:
        sys.exit(f"ERROR: source file is missing required column(s): {missing_cols}")

    payload = build_payload(df, input_path.name)
    merge_notes = payload.pop("_mergeNotes")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        # Written as a plain <script> assignment (not bare JSON) so the
        # dashboard can load it with a <script src="..."> tag instead of
        # fetch(). This is deliberate: browsers block fetch() of local
        # files when index.html is opened directly (file://) rather than
        # served over http(s) -- e.g. by double-clicking it, or by SharePoint
        # previewing it outside a document library context. A <script> tag
        # has no such restriction, so this keeps the dashboard working
        # however it's opened.
        f.write("window.__TN_DASHBOARD_DATA__ = ")
        json.dump(payload, f, separators=(",", ":"))
        f.write(";")

    print(f"Wrote {output_path} ({output_path.stat().st_size / 1024:.1f} KB)")
    payload["_mergeNotes"] = merge_notes
    print_summary(df, payload)


if __name__ == "__main__":
    main()
