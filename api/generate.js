// api/generate.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt を入れてください" });
    }

    // --- ここが重要：環境変数の余計な文字を除去 ---
    let apiKeyRaw = process.env.OPENAI_API_KEY || "";
    // よくある混入パターンを除去（先頭/末尾の空白・改行、"export "、"OPENAI_API_KEY="）
    let apiKey = apiKeyRaw
      .replace(/^export\s+/i, "")                // 先頭の "export "
      .replace(/^OPENAI_API_KEY\s*=\s*/i, "")    // "OPENAI_API_KEY="
      .trim();                                   // 前後の空白/改行

    if (!apiKey || !apiKey.startsWith("sk-")) {
      return res.status(500).json({
        error: `OPENAI_API_KEY が不正です（先頭: "${(apiKey || "").slice(0,6)}..."）`
      });
    }
    // ---------------------------------------------

    // 画像生成（base64で受け取る）
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        quality: "high",
        response_format: "b64_json"
      })
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.error?.message || `OpenAI エラー（${r.status}）`
      });
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(500).json({ error: "画像データがありません" });
    }

    const dataUrl = `data:image/png;base64,${b64}`;
    return res.status(200).json({ image: dataUrl });

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
