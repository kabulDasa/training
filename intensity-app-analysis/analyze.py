"""Which exercises in an Intensity app export are trained most but aren't in the H2 program.

Usage: python3 analyze.py <export.csv> [--since YYYY-MM-DD] [--top N] > results/<date>.md

The export is the Intensity app's CSV (one row per set: Date, Exercise, Reps, Set, Weight, ...).
Intensity names map to the tracker's movement keys (movements.js) through PROGRAM below; keep it in
step with movements.js when the program changes. ALIASES folds name variants into one exercise.
Prints a Markdown report: the current program's coverage, then the most-trained exercises outside
it over the whole log and since --since (default: 1 July of the export's last year).
"""
import argparse
import collections
import csv
import sys

# Intensity exercise name -> movements.js key; None = logged in the app as a retired skill movement
PROGRAM = {
    'Pullups': 'pullup', 'Bodyweight chin ups': 'pullup',
    'Single lat pull down': 'latpulldown',
    'Dumbell row': 'invertedrow', 'Inverted row': 'invertedrow',
    'Barbell curls': 'bicepcurl',
    'Facepulls': 'facepull',
    'Dips': 'dip',
    'Overhead press': 'ohp',
    'Shoulder fly': 'shoulderfly',
    'Cable chest flys': 'chestfly',
    'Triceps extensions': 'tricepext',
    'Squats': 'squat',
    'Front squat': 'frontsquat', 'Front squats': 'frontsquat',
}
RETIRED = {'Muscle ups', 'Tuck front lever', 'Tuck front lever raise', 'Hanging knee raise'}
# variants counted as one exercise (Intensity name -> group name)
ALIASES = {
    'Bent over rows': 'Barbell row', 'Pendlay rows': 'Barbell row',
    'Pause sumo deadlifts': 'Sumo deadlifts',
    'Dumbbell rows': 'Dumbell row',
}


def load(path):
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def summarize(rows):
    """{exercise group: {days, sets, top, last}} for the rows given"""
    out = collections.defaultdict(lambda: {'days': set(), 'sets': 0, 'top': 0.0, 'last': ''})
    for r in rows:
        name = r['Exercise'].strip()
        g = out[ALIASES.get(name, name)]
        g['days'].add(r['Date'])
        g['sets'] += 1
        g['top'] = max(g['top'], num(r['Weight']))
        g['last'] = max(g['last'], r['Date'])
    return out


def status(name):
    if name in PROGRAM:
        return 'program'
    if name in RETIRED:
        return 'retired'
    return 'missing'


def kg(v):
    return f'{v:g} kg' if v else '–'


def table(groups, which, top):
    names = sorted((n for n in groups if status(n) in which), key=lambda n: (-len(groups[n]['days']), n))[:top]
    lines = ['| Exercise | Days | Sets | Top weight | Last done |', '|---|---|---|---|---|']
    for n in names:
        g = groups[n]
        lines.append(f"| {n} | {len(g['days'])} | {g['sets']} | {kg(g['top'])} | {g['last']} |")
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('csv')
    ap.add_argument('--since', help='start of the recent window, YYYY-MM-DD')
    ap.add_argument('--top', type=int, default=20)
    a = ap.parse_args()

    rows = load(a.csv)
    if not rows:
        sys.exit('empty export')
    first, last = min(r['Date'] for r in rows), max(r['Date'] for r in rows)
    since = a.since or last[:4] + '-07-01'
    whole = summarize(rows)
    recent = summarize([r for r in rows if r['Date'] >= since])

    print(f'# Intensity export: exercises not in the program\n')
    print(f'{len(rows)} sets, {first} to {last}. Weights for bodyweight movements include bodyweight '
          'as the app logs them.\n')
    print('## Not in the program, whole log\n')
    print(table(whole, {'missing'}, a.top))
    print(f'\n## Not in the program, since {since}\n')
    print(table(recent, {'missing'}, a.top))
    print(f'\n## Retired in the tracker but still logged since {since}\n')
    print(table(recent, {'retired'}, a.top))
    print(f'\n## In the program, since {since}\n')
    print(table(recent, {'program'}, a.top))


if __name__ == '__main__':
    main()
