"""Turn the exported Coralytics model outputs into the compact files the site loads.

Inputs (a folder of raw exports, see README):
  reefs.json     {"layer": <GET /layer>, "years": <GET /years>} from the model API
  pressure.json  local pressure percentiles per reef (fishing, runoff, ...)
  people.json    people living within 50 km of each reef
  impact.json    reef tourism value and flood protection within 25 km
  projects.json  known restoration projects [lat, lon, reef index, name]

Output (written to ../data):
  reefs.json     one compact file with everything the browser needs

Usage:
  python scripts/prepare_data.py path/to/raw_exports
"""

import json
import sys
from pathlib import Path


def main(raw_dir: Path, out_dir: Path) -> None:
    raw = json.loads((raw_dir / "reefs.json").read_text())
    layer, years = raw["layer"], raw["years"]
    reefs = layer["reefs"]
    n = len(reefs)
    assert n == layer["n"] == years["n"], "reef counts do not line up"
    assert all(r["i"] == k for k, r in enumerate(reefs)), "reefs are not in index order"

    # Repeated names are stored once and referenced by number to keep the file small.
    names: list[str] = []
    name_id: dict[str, int] = {}

    def ref(text):
        text = text or ""
        if text not in name_id:
            name_id[text] = len(names)
            names.append(text)
        return name_id[text]

    pressure = json.loads((raw_dir / "pressure.json").read_text())
    people = json.loads((raw_dir / "people.json").read_text())
    impact = json.loads((raw_dir / "impact.json").read_text())
    projects = json.loads((raw_dir / "projects.json").read_text())

    out = {
        "about": "Coralytics reef data. Scores from a LightGBM model on NOAA CoralTemp, "
                 "trained on the Global Coral Bleaching Database.",
        "n": n,
        "names": names,
        "lat": [round(r["lat"], 3) for r in reefs],
        "lon": [round(r["lon"], 3) for r in reefs],
        "eco": [ref(r["eco"]) for r in reefs],
        "country": [ref(r["country"]) for r in reefs],
        "realm": [ref(r["realm"]) for r in reefs],
        # Bleaching history: yearly risk (0-scale) and, for each warming shift,
        # how many of the last 10 years crossed the bleaching line.
        "years": years["years"],
        "scale": years["scale"],
        "window": years["window"],
        "shifts": years["shifts"],
        "ann": years["ann"],        # base64 bytes, index [year * n + reef]
        "counts": years["counts"],  # base64 bytes, index [shift * n + reef]
        "pressure": {k: pressure[k] for k in
                     ["pressure", "connect", "fishing", "nitrogen", "sediment",
                      "coastal", "tourism", "industry"]},
        "people_50km": people["pop"],
        "tourism_usd_25km": impact["tourism"],
        "flood_people_25km": impact["flood"],
        "projects": projects,
    }
    for key in ["lat", "lon", "people_50km", "tourism_usd_25km", "flood_people_25km"]:
        assert len(out[key]) == n, key
    for key, values in out["pressure"].items():
        assert len(values) == n, key

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "reefs.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {path} ({path.stat().st_size / 1e6:.1f} MB, {n} reefs)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(__file__).resolve().parent.parent / "data")
