# Backspin

Backspin is a mobile-first personal golf score tracker. It stores one active course, one current round, and the last 20 archived rounds locally in your browser.

## Run locally

From this folder:

```bash
python3 -m http.server 4173
```

Open on this machine:

```text
http://127.0.0.1:4173
```

To view from a phone on the same Wi-Fi, run the server bound to all interfaces:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open:

```text
http://<this-computer-lan-ip>:4173
```

## Features

- Gross-strokes-only score entry
- Par and yardage course setup
- St. Johns Golf & Country Club Silver tees preloaded as the default course
- Save up to 10 courses with one active course at a time
- Auto-save after every score/hole change
- Start New Round archives the current partial or complete round
- Last 20 archived rounds are used for per-hole history
- History shows the last 10 archived scores for each hole
- Play view shows gross total and to-par score separately
- Per-hole low, high, average, play-view last-5, and history-view last-10 scores
- Export/import JSON backup tools
- Light mode by default with a dark mode toggle
- Reset local data

## Stored browser data

Backspin uses `localStorage` under the key:

```text
backspin:v1
```

It stores:

- saved courses, up to 10
- active course id
- 18 hole par values per course
- 18 hole yardage values per course
- current round scores and active hole
- last 20 archived rounds

## Limitations

- Local-only; no cloud sync
- Up to 10 saved courses in v1
- Gross scoring only
- No handicap, putts, fairways, or GIR stats yet
- Offline-first packaging is not implemented yet
