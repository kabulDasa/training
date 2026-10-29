# Intensity app analysis

Compares an Intensity app CSV export with the H2 program (`movements.js`) to find exercises that are
trained often but aren't tracked.

```bash
python3 analyze.py export-YYYY-MM-DD.csv [--since 2026-07-01] [--top 20] > results/YYYY-MM-DD.md
```

Keep the export next to the script as `export-<date>.csv`: CSVs here are gitignored (the repo is
public). When the program changes, update `PROGRAM` / `RETIRED` in `analyze.py` to match.

`results/` holds past reports.
