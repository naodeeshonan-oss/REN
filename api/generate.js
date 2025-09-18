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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY が未設定です（Vercelに入れてください）" });
    }

    let url = "https://api.openai.com/v1/images/generations";
    let body;

    if (imageData) {
      // 画像編集モード
      url = "https://api.openai.com/v1/images/edits";

      // base64 → Blob (OpenAI APIはFormData形式で送る必要あり)
      const form = new FormData();
      const imgBuffer = Buffer.from(imageData.split(",")[1], "base64");

      form.append("image", new Blob([imgBuffer]), "image.png");
      form.append("prompt", prompt);
      form.append("size", "1024x1024");

      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        },
        body: form
      });

      const data = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({ error: data?.error?.message || "OpenAI エラー" });
      }

      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) {
        return res.status(500).json({ error: "画像データがありません" });
      }

      return res.status(200).json({ image: `data:image/png;base64,${b64}` });
    }

    // 新規生成モード
    body = JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024"
    });

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error?.message || "OpenAI エラー" });
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(500).json({ error: "画像データがありません" });
    }

    return res.status(200).json({ image: `data:image/png;base64,${b64}` });

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
