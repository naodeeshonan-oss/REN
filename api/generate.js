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

    // 貼り付け時のゴミ掃除（export や OPENAI_API_KEY= などを除去）
    let apiKey = (process.env.OPENAI_API_KEY || "")
      .replace(/^export\s+/i, "")
      .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
      .trim();

    if (!apiKey || !apiKey.startsWith("sk-")) {
      return res.status(500).json({ error: `OPENAI_API_KEY が不正です（先頭: "${(apiKey || "").slice(0,6)}..."）` });
    }

    // 画像生成：response_format は送らない（今は未対応のため）
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
    let image = null;

    if (item.b64_json) {
      image = `data:image/png;base64,${item.b64_json}`;
    } else if (item.url) {
      image = item.url;
    }

    if (!image) {
      return res.status(500).json({ error: "画像データがありません" });
    }

    return res.status(200).json({ image });

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
