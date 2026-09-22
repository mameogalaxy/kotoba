// 脳みそ仕分け — ローカル用の最小プロキシ
//
//   node proxy.mjs            → http://localhost:8787 でアプリを配信
//   node proxy.mjs 9000       → ポートを変える
//
// ブラウザから api.typesafe.ai を直接叩けない（CORS で弾かれる）場合にだけ必要です。
// 起動したら、アプリの設定でエンドポイントを http://localhost:8787/jev に変えてください。
//
// APIキーはこのプロセスに保存されません。ブラウザが送ってきた Authorization
// ヘッダーをそのまま上流へ中継するだけです。

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.argv[2]) || 8787;
const ROOT = process.cwd();
const UPSTREAM = process.env.JEV_ENDPOINT || "https://api.typesafe.ai/v1/systemone";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  // ---- Jev への中継 ----
  if (req.url.startsWith("/jev")) {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "POST only" }));
      return;
    }
    const body = await readBody(req);
    const auth = req.headers["authorization"];
    if (!auth) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Authorization ヘッダーがありません" }));
      return;
    }
    try {
      const upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body,
      });
      const text = await upstream.text();
      console.log(`[jev] ${upstream.status} ${body.length}B in / ${text.length}B out`);
      res.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
      });
      res.end(text);
    } catch (err) {
      console.error("[jev] 上流への接続に失敗:", err.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "上流への接続に失敗しました", detail: String(err) }));
    }
    return;
  }

  // ---- 静的配信 ----
  const rel = normalize(decodeURIComponent(req.url.split("?")[0]));
  if (rel.includes("..")) {
    res.writeHead(403).end("forbidden");
    return;
  }
  const file = join(ROOT, rel === "/" || rel === "\\" ? "index.html" : rel);
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`脳みそ仕分け  →  http://localhost:${PORT}`);
  console.log(`Jev 中継       →  http://localhost:${PORT}/jev  (上流: ${UPSTREAM})`);
});
