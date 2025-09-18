// api/generate.js  ←ファイル名はこのまま
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt を入れてください" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY が未設定です（Vercelに入れてください）" });
    }

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
      // OpenAI からのエラーメッセージをそのまま返す
      return res.status(r.status).json({ error: data?.error?.message || "OpenAI エラー" });
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(500).json({ error: "画像データがありません" });
    }

    // フロントがそのまま <img src="..."> で表示できる形で返す
    const dataUrl = `data:image/png;base64,${b64}`;
    return res.status(200).json({ image: dataUrl });

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
