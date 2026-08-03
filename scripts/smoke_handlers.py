import asyncio
import json
import subprocess
import tempfile
import time
import urllib.request

import websockets

BASE = "http://127.0.0.1:8765/"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9338

HANDLERS = [
    "handleAuth",
    "quickLogin",
    "switchTab",
    "toggleTheme",
    "saveSettings",
    "generateGroceryList",
    "startExecution",
    "generateFutureTimeline",
    "openDayDetail",
    "roundEquipment",
    "openExerciseSetsModal",
    "shareActiveRoute",
]


async def main():
    user = tempfile.mkdtemp(prefix="ascensus-cdp6-")
    proc = subprocess.Popen(
        [
            CHROME,
            f"--remote-debugging-port={PORT}",
            "--headless=new",
            "--disable-gpu",
            "--disable-cache",
            f"--user-data-dir={user}",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(2)
    targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list"))
    page = next((t for t in targets if t.get("type") == "page"), targets[0])
    exceptions = []
    async with websockets.connect(page["webSocketDebuggerUrl"], max_size=None) as ws:
        nid = 1
        queue = asyncio.Queue()

        async def reader():
            while True:
                raw = await ws.recv()
                msg = json.loads(raw)
                if msg.get("method") == "Runtime.exceptionThrown":
                    exceptions.append(msg["params"].get("exceptionDetails", {}))
                if "id" in msg:
                    await queue.put(msg)

        reader_task = asyncio.create_task(reader())

        async def send(method, params=None):
            nonlocal nid
            mid = nid
            nid += 1
            await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
            while True:
                msg = await queue.get()
                if msg.get("id") == mid:
                    return msg

        await send("Runtime.enable")
        await send("Page.enable")
        await send("Page.navigate", {"url": BASE})
        # wait for load
        await asyncio.sleep(6)
        expr = "JSON.stringify({" + ",".join(
            f"{h}:typeof window.{h}" for h in HANDLERS
        ) + ",title:document.title,main:[...document.scripts].map(s=>s.src).filter(Boolean)})"
        res = await send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        val = res.get("result", {}).get("result", {}).get("value")
        print("result", val)
        data = json.loads(val or "{}")
        missing = [k for k in HANDLERS if data.get(k) != "function"]
        print("missing", missing)
        print("exceptions", len(exceptions))
        for ed in exceptions[:5]:
            print("ex", (ed.get("exception") or {}).get("description"), ed.get("url"), ed.get("lineNumber"))
        reader_task.cancel()
        proc.kill()
        if missing or exceptions:
            raise SystemExit(1)
        print("SMOKE OK")


asyncio.run(main())
