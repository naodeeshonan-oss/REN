// api/generate.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  try {
    const { prompt = "", imageData = null } = req.body || {};

    // --- APIキー整形（export や OPENAI_API_KEY= を除去して sk- で始まるか確認） ---
    let apiKey = (process.env.OPENAI_API_KEY || "")
      .replace(/^export\s+/i, "")
      .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
      .trim();
    if (!apiKey || !apiKey.startsWith("sk-")) {
      return res.status(500).json({
        error: `OPENAI_API_KEY が不正です（先頭: "${(apiKey || "").slice(0,6)}..."）`
      });
    }

    // 画像なし → 新規生成
    if (!imageData) {
      if (!prompt) {
        return res.status(400).json({ error: "プロンプトを入れてください" });
      }

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
          quality: "high"
        })
      });

      const data = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({
          error: data?.error?.message || `OpenAI エラー（${r.status}）`
        });
      }

      const item = data?.data?.[0] || {};
      const image = item.b64_json
        ? `data:image/png;base64,${item.b64_json}`
        : item.url || null;

      if (!image) return res.status(500).json({ error: "画像データがありません" });
      return res.status(200).json({ image });
    }

    // 画像あり → 編集（/images/edits に multipart で送る）
    // imageData 例: "data:image/png;base64,AAAA..."
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(imageData || "");
    if (!m) {
      return res.status(400).json({ error: "画像データの形式が不正です" });
    }
    const mime = m[1];                    // 例: image/png
    const base64 = m[2];
    const buf = Buffer.from(base64, "base64");
    const ext = mime.split("/")[1] || "png";

    // Node18/Vercel では Web FormData/Blob が使えます
    const form = new FormData();
    form.append("prompt", prompt || "");
    form.append("size", "1024x1024");
    form.append("image", new Blob([buf], { type: mime }), `upload.${ext}`);

    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: form       // ← Content-Type ヘッダは自動で付ける（自分で付けない）
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.error?.message || `OpenAI エラー（${r.status}）`
      });
    }

    const item = data?.data?.[0] || {};
    const image = item.b64_json
      ? `data:image/png;base64,${item.b64_json}`
      : item.url || null;

    if (!image) return res.status(500).json({ error: "画像データがありません" });
    return res.status(200).json({ image });

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
