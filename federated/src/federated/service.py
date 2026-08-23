from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from federated.run import run_federated


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        if self.path != "/federation/runs":
            self.send_error(404)
            return

        if self.headers.get("X-Federation-Key") != os.environ.get(
            "FEDERATION_SHARED_SECRET", "development-federation-key"
        ):
            self.send_error(401, "Invalid federation key")
            return

        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        required = ["round_id", "round", "node_ids", "callback_url"]
        if any(key not in body for key in required):
            self.send_error(400, "round_id, round, node_ids, and callback_url are required")
            return

        os.environ["FEDERATION_ROUND_ID"] = str(body["round_id"])
        os.environ["FEDERATION_CALLBACK_URL"] = str(body["callback_url"])
        os.environ["FEDERATION_NODE_IDS"] = ",".join(str(node) for node in body["node_ids"])
        config = body.get("config", {})
        os.environ["FEDERATION_ROUNDS"] = str(config.get("num-server-rounds", 3))

        threading.Thread(target=run_federated, daemon=True).start()
        self.send_response(202)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "started", "round_id": body["round_id"]}).encode())

    def log_message(self, format: str, *args: object) -> None:
        print(format % args)


def main() -> None:
    port = int(os.environ.get("PORT", "8001"))
    print(f"Federated service listening on http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
