import asyncio
import json
import subprocess
import tempfile
import time
import urllib.request

import websockets

BASE = "http://127.0.0.1:8765/"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9336


async def main():
    user = tempfile.mkdtemp(prefix="ascensus-cdp4-")
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
    cons = []
    failed = []
    async with websockets.connect(page["webSocketDebuggerUrl"], max_size=None) as ws:
        nid = 1

        async def send(method, params=None):
            nonlocal nid
            mid = nid
            nid += 1
            await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
            while True:
                msg = json.loads(await ws.recv())
                method_name = msg.get("method")
                if method_name == "Runtime.exceptionThrown":
                    ed = msg["params"].get("exceptionDetails", {})
                    exceptions.append(ed)
                    desc = (
                        ed.get("exception", {}).get("description")
                        or ed.get("text")
                        or "?"
                    )
                    print(
                        "EXCEPTION",
                        desc.encode("ascii", "replace").decode(),
                        "at",
                        ed.get("url"),
                        "line",
                        ed.get("lineNumber"),
                    )
                elif method_name == "Runtime.consoleAPICalled":
                    args = msg["params"].get("args") or []
                    text = " ".join(str(a.get("value", a.get("description", ""))) for a in args)
                    cons.append(f"{msg['params'].get('type')}: {text}")
                elif method_name == "Network.loadingFailed":
                    failed.append(msg["params"])
                elif method_name == "Network.responseReceived":
                    resp = msg["params"].get("response", {})
                    url = resp.get("url", "")
                    if "/src/" in url and resp.get("status", 200) >= 400:
                        failed.append(msg["params"])
                if msg.get("id") == mid:
                    return msg

        await send("Runtime.enable")
        await send("Network.enable")
        await send("Page.enable")
        await send("Page.navigate", {"url": BASE})
        await asyncio.sleep(5)
        res = await send(
            "Runtime.evaluate",
            {
                "expression": (
                    "JSON.stringify({"
                    "handleAuth:typeof window.handleAuth,"
                    "switchTab:typeof window.switchTab,"
                    "scripts: [...document.scripts].map(s=>s.src),"
                    "modErr: window.__modErr || null"
                    "})"
                ),
                "returnByValue": True,
            },
        )
        val = res.get("result", {}).get("result", {}).get("value")
        print("bindings", val)
        print("exceptions_count", len(exceptions))
        print("failed_count", len(failed))
        for f in failed[:10]:
            print("failed", json.dumps(f)[:300].encode("ascii", "replace").decode())
        for c in cons[:30]:
            print("console", c.encode("ascii", "replace").decode())
        data = json.loads(val or "{}")
        ok = data.get("handleAuth") == "function" and data.get("switchTab") == "function"
        print("SMOKE", "OK" if ok and not exceptions else "FAIL")
        proc.kill()
        if not ok or exceptions:
            raise SystemExit(1)


asyncio.run(main())
