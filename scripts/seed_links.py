"""Create Shrinkly short links for Ramya's live projects.

Usage (PowerShell):
    $env:SHRINKLY_API_KEY = "<your API key>"
    python scripts/seed_links.py

Usage (bash):
    SHRINKLY_API_KEY=<your API key> python scripts/seed_links.py

Safe to re-run: aliases that already exist are skipped.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("SHRINKLY_URL", "https://shortener-ramya.duckdns.org")
KEY = os.environ.get("SHRINKLY_API_KEY")

LINKS = [
    ("portfolio",     "https://ramya-umber.vercel.app"),
    ("github",        "https://github.com/Ramya-Shah"),
    ("taskforge",     "https://taskforge.136.80.52.40.sslip.io"),
    ("oauth-ready",   "https://oauth-ready-ten.vercel.app"),
    ("codepulse",     "https://codepulse-codepulse-dashboard.vercel.app"),
    ("snap-to-pay",   "https://snap-to-pay.vercel.app"),
    ("unspoof",       "https://unspoof.vercel.app"),
    ("uptime",        "http://35.185.46.96"),
    ("wind-forecast", "https://wind-forecast-monitor-zeta.vercel.app"),
    ("email-tracker", "https://email-tracker-sable.vercel.app"),
    ("shrinkly-src",  "https://github.com/Ramya-Shah/url-shortener"),
]


def main() -> int:
    if not KEY:
        print("Set SHRINKLY_API_KEY first (the key shown once after sign-up).")
        return 1
    ok = 0
    for alias, url in LINKS:
        body = json.dumps({"long_url": url, "custom_alias": alias}).encode()
        req = urllib.request.Request(
            f"{BASE}/shorten", data=body, method="POST",
            headers={"Content-Type": "application/json", "X-API-Key": KEY},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                print(f"created  {json.load(r)['short_url']}  ->  {url}")
                ok += 1
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:120]
            if e.code in (400, 409):
                print(f"skipped  /{alias}  ({detail})")
            elif e.code in (401, 403):
                print("API key rejected. Check SHRINKLY_API_KEY.")
                return 1
            else:
                print(f"failed   /{alias}  HTTP {e.code} {detail}")
    print(f"\n{ok} new link(s) created.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
