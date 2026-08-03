"""Smoke-test: fetch entry + recursive module graph; optional Chromium console check."""
import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urljoin

BASE = "http://127.0.0.1:8765/"
seen = set()
errors = []


def fetch(url: str) -> str:
    with urllib.request.urlopen(url, timeout=10) as r:
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status} for {url}")
        return r.read().decode("utf-8", errors="replace")


def crawl(url: str):
    if url in seen:
        return
    seen.add(url)
    try:
        text = fetch(url)
    except Exception as e:
        errors.append(f"FETCH FAIL {url}: {e}")
        return
    if not url.endswith(".js"):
        return
    for m in re.finditer(r"from\s+['\"]([^'\"]+)['\"]", text):
        rel = m.group(1)
        if not rel.endswith(".js"):
            continue
        nxt = urljoin(url, rel)
        crawl(nxt)


crawl(urljoin(BASE, "src/main.js"))
crawl(urljoin(BASE, "index.html"))
crawl(urljoin(BASE, "style.css"))
crawl(urljoin(BASE, "sw.js"))
crawl(urljoin(BASE, "data/seed-database.json"))

print(f"fetched {len(seen)} assets")
for e in errors:
    print(e)

# Try playwright for console errors
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright not installed; static graph only")
    sys.exit(1 if errors else 0)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    cons = []
    page.on("console", lambda msg: cons.append(f"{msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: cons.append(f"pageerror: {err}"))
    page.goto(BASE, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2500)
    # Check bindUi exposed handlers
    has_login = page.evaluate("typeof window.handleAuth")
    has_tab = page.evaluate("typeof window.switchTab")
    print("window.handleAuth =", has_login)
    print("window.switchTab =", has_tab)
    bad = [c for c in cons if c.startswith("error") or c.startswith("pageerror")]
    for c in cons[:40]:
        print("console:", c)
    browser.close()
    if bad or has_login != "function" or has_tab != "function":
        print("SMOKE FAIL")
        sys.exit(1)
    print("SMOKE OK")
