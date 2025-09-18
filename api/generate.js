// api/generate.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  try {
    const { prompt, imageData } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt を入れてください" });
    }

    let apiKey = (process.env.OPENAI_API_KEY || "")
      .replace(/^export\s+/i, "")
      .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
      .trim();
    if (!apiKey || !apiKey.startsWith("sk-")) {
      return res.status(500).json({ error: `OPENAI_API_KEY が不正です（先頭: "${(apiKey || "").slice(0,6)}..."）` });
    }

    // 画像なし → 新規生成
    if (!imageData) {
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
      if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || `OpenAI エラー（${r.status}）` });
      const item = data?.data?.[0] || {};
      const image = item?.b64_json
        ? `data:image/png;base64,${item.b64_json}`
        : item?.url || null;
      if (!image) return res.status(500).json({ error: "画像データがありません" });
      return res.status(200).json({ image });
    }

    // 画像あり → 編集
    const m = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: "imageData の形式が不正です" });
    const mime = m[1];
    const b64 = m[2];
    const buf = Buffer.from(b64, "base64");

    // File を利用（Node18+）
    const file = new File([buf], "upload.png", { type: mime });

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("image", file); // ← File を直接渡す
    form.append("size", "1024x1024");

    const r2 = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: form
    });

    const text = await r2.text(); // ← JSON 以外でも受け取れるように一旦テキストで
    let data2;
    try { data2 = JSON.parse(text); }
    catch { return res.status(500).json({ error: `OpenAI 応答がJSONでない: ${text.slice(0,200)}` }); }

    if (!r2.ok) return res.status(r2.status).json({ error: data2?.error?.message || `OpenAI エラー（${r2.status}）` });

    const item2 = data2?.data?.[0] || {};
    const image2 = item2?.b64_json
      ? `data:image/png;base64,${item2.b64_json}`
      : item2?.url || null;

    if (!image2) return res.status(500).json({ error: "画像データがありません" });
    return res.status(200).json({ image: image2 });

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
