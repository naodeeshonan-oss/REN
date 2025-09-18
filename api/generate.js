// /api/generate.js
// テキストだけ → 画像生成（generations）
// 画像あり     → 画像編集（edits）  ※マスクは使わず全体変換

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  try {
    const { prompt, image } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt を入れてください" });
    }

    // ====== APIキー取り出し（先頭に export や OPENAI_API_KEY= が混ざっても吸収）======
    let apiKey = (process.env.OPENAI_API_KEY || "")
      .replace(/^export\s+/i, "")
      .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
      .trim();

    if (!apiKey || !apiKey.startsWith("sk-")) {
      return res.status(500).json({ error: "サーバの OPENAI_API_KEY が不正です" });
    }

    // ====== 画像「なし」→ 新規生成 ======
    if (!image) {
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
          // response_format は送らない（環境で弾かれることがあるため）
        })
      });

      const data = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({ error: data?.error?.message || `OpenAI エラー（${r.status}）` });
      }

      const item = data?.data?.[0] || {};
      const imageUrl = item.url ? item.url :
                       item.b64_json ? `data:image/png;base64,${item.b64_json}` : null;

      if (!imageUrl) {
        return res.status(500).json({ error: "画像データがありません" });
      }
      return res.status(200).json({ image: imageUrl });
    }

    // ====== 画像「あり」→ 編集（全体変換）。クライアント側で PNG(RGBA) に直して送ってくる想定 ======
    if (!image?.data) {
      return res.status(400).json({ error: "画像データがありません" });
    }

    // Base64 → バイナリ
    const bin = Buffer.from(String(image.data), "base64");
    const filename = image.name || "image.png";
    const contentType = image.type || "image/png";

    // multipart/form-data を作って OpenAI へ転送
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", "1024x1024");
    form.append("quality", "high");
    // マスクは付けない（PNGがRGBでも通りやすくする）
    form.append("image", new Blob([bin], { type: contentType }), filename);

    const r2 = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: form
    });

    // OpenAI が text/html を返してくるケースもあるため防御的に扱う
    const text = await r2.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 300) }; }

    if (!r2.ok) {
      return res.status(r2.status).json({ error: data?.error?.message || String(data?.error || "OpenAI エラー") });
    }

    const item = data?.data?.[0] || {};
    const imageUrl = item.url ? item.url :
                     item.b64_json ? `data:image/png;base64,${item.b64_json}` : null;

    if (!imageUrl) {
      return res.status(500).json({ error: "画像データがありません" });
    }
    return res.status(200).json({ image: imageUrl });

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
