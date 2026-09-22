// Jev への中継（Vercel サーバーレス関数）
//
// アプリと同じドメインで動くので、ブラウザから見ると同一オリジンになり、
// CORS の問題が消える。api.typesafe.ai を呼ぶのはブラウザではなくこの関数。
//
// APIキーはここに保存されない。ブラウザが送ってきた Authorization ヘッダーを
// そのまま上流へ渡すだけ。環境変数も不要。

const UPSTREAM = process.env.JEV_ENDPOINT || "https://api.typesafe.ai/v1/systemone";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const auth = req.headers.authorization;
  if (!auth) {
    res.status(401).json({ error: "Authorization ヘッダーがありません" });
    return;
  }

  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body,
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: "上流への接続に失敗しました", detail: String(err) });
  }
}
