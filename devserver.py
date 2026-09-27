"""Local static server with caching disabled, for testing Iron Canopy.
POST /__shot?name=x with a JPEG/PNG data URL saves it to shots/x.jpg (development only)."""
import base64
import http.server
import os
import re
import socketserver
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/__shot":
            self.send_error(404)
            return
        name = re.sub(r"[^a-z0-9_-]", "", (parse_qs(u.query).get("name") or ["shot"])[0].lower()) or "shot"
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("ascii", "ignore")
        data = base64.b64decode(body.split(",", 1)[-1])
        os.makedirs(os.path.join(ROOT, "shots"), exist_ok=True)
        with open(os.path.join(ROOT, "shots", name + ".jpg"), "wb") as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


with Server(("", 8766), NoCache) as httpd:
    httpd.serve_forever()
