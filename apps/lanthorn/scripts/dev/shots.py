#!/usr/bin/env python3
"""App Store screenshots via Chrome DevTools Protocol device emulation.

Headless Chrome's `--window-size` does NOT set the layout viewport (it stays a
fixed ~500px), so the board overflows the capture and fixed-position overlays
(the win card) center on the wrong width. CDP's Emulation.setDeviceMetricsOverride
sets the REAL viewport, so everything lays out at the exact target width and the
capture is pixel-exact. Universal app -> iPhone 6.5" + iPad 13".

Output: screenshots/appstore/*.png   Run: python3 scripts/dev/shots.py
"""
import base64, json, os, subprocess, sys, time, urllib.request
import websocket  # websocket-client (pip name), imported as `websocket`

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # scripts/dev/x -> repo
WEB = os.path.join(ROOT, "web")
OUT = os.path.join(ROOT, "screenshots", "appstore")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DBG_PORT = 9333
SRV_PORT = 4179

# name, css_w, css_h, dsf, state, level
SHOTS = [
    ("iphone65_1_play",  414,  896, 3, "play",  7),
    ("iphone65_2_win",   414,  896, 3, "win",  20),
    ("iphone65_3_sky",   414,  896, 3, "sky",   7),
    ("iphone65_4_title", 414,  896, 3, "title", 7),
    ("ipad13_1_play",   1024, 1366, 2, "play",  7),
    ("ipad13_2_win",    1024, 1366, 2, "win",  20),
    ("ipad13_3_sky",    1024, 1366, 2, "sky",   7),
    ("ipad13_4_title",  1024, 1366, 2, "title", 7),
]


class CDP:
    def __init__(self, url):
        self.ws = websocket.create_connection(url, max_size=None, timeout=20)
        self.n = 0

    def cmd(self, method, params=None):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params or {}}))
        while True:
            r = json.loads(self.ws.recv())
            if r.get("id") == self.n:
                if "error" in r:
                    raise RuntimeError(f"{method}: {r['error']}")
                return r.get("result", {})

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def wait_endpoint(url, tries=60):
    for _ in range(tries):
        try:
            return json.loads(urllib.request.urlopen(url, timeout=1).read())
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("chrome devtools endpoint not ready")


def main():
    os.makedirs(OUT, exist_ok=True)
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(SRV_PORT), "--directory", WEB],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    udir = os.path.join("/tmp", "lanthorn-shots-profile")
    chrome = subprocess.Popen(
        [CHROME, "--headless", f"--remote-debugging-port={DBG_PORT}", "--remote-allow-origins=*",
         "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
         f"--user-data-dir={udir}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_endpoint(f"http://localhost:{DBG_PORT}/json/version")
        targets = wait_endpoint(f"http://localhost:{DBG_PORT}/json")
        page = next(t for t in targets if t.get("type") == "page")
        cdp = CDP(page["webSocketDebuggerUrl"])
        cdp.cmd("Page.enable")
        for name, w, h, dsf, state, n in SHOTS:
            cdp.cmd("Emulation.setDeviceMetricsOverride",
                    {"width": w, "height": h, "deviceScaleFactor": dsf, "mobile": True})
            cdp.cmd("Page.navigate",
                    {"url": f"http://localhost:{SRV_PORT}/?shot={state}&n={n}"})
            time.sleep(2.6)  # load + harness 220ms + animation settle
            res = cdp.cmd("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
            with open(os.path.join(OUT, name + ".png"), "wb") as f:
                f.write(base64.b64decode(res["data"]))
            print(f"  {name}.png  {w*dsf}x{h*dsf}")
        cdp.close()
    finally:
        chrome.terminate()
        srv.terminate()
    print("done ->", OUT)


if __name__ == "__main__":
    main()
