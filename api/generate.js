// api/generate.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  try {
    const { prompt, image } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt を入れてください" });
    }

    // APIキーの整形（export や OPENAI_API_KEY= を除去）
    let apiKey = (process.env.OPENAI_API_KEY || "")
      .replace(/^export\s+/i, "")
      .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
      .trim();

    if (!apiKey || !apiKey.startsWith("sk-")) {
      return res.status(500).json({ error: `OPENAI_API_KEY が不正です（先頭: "${(apiKey || "").slice(0,6)}..."）` });
    }

    let endpoint = "https://api.openai.com/v1/images/generations";
    let body = {
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "high"
    };

    // 画像がアップロードされた場合は「編集モード」
    if (image) {
      endpoint = "https://api.openai.com/v1/images/edits";
      // OpenAI の images/edits は multipart/form-data が必要
      // ここは簡易的にサポート：base64 → バイナリ化して送信
      const buffer = Buffer.from(image, "base64");
      const formData = new FormData();
      formData.append("image", new Blob([buffer]), "input.png");
      formData.append("prompt", prompt);
      formData.append("size", "1024x1024");
      formData.append("model", "gpt-image-1");
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData
      });
      const data = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({ error: data?.error?.message || "OpenAI エラー" });
      }
      const url = data?.data?.[0]?.url;
      return res.status(200).json({ image: url });
    }

    // 通常の新規生成
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error?.message || "OpenAI エラー" });
    }

    const item = data?.data?.[0] || {};
    const imageUrl = item.url || null;
    if (!imageUrl) {
      return res.status(500).json({ error: "画像データがありません" });
    }

    return res.status(200).json({ image: imageUrl });

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
