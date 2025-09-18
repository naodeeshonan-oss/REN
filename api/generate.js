// api/generate.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  try {
    const { prompt, imageDataUrl } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt を入れてください" });
    }

    // Vercelの環境変数掃除（export/プレフィクス混入対策）
    let apiKey = (process.env.OPENAI_API_KEY || "")
      .replace(/^export\s+/i, "")
      .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
      .trim();
    if (!apiKey || !apiKey.startsWith("sk-")) {
      return res.status(500).json({ error: "OPENAI_API_KEY が未設定または不正です" });
    }

    // ---- 画像なし：新規生成 -------------------------------
    if (!imageDataUrl) {
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

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return res.status(r.status).json({ error: data?.error?.message || `OpenAI エラー（${r.status}）` });
      }

      const item = data?.data?.[0] || {};
      const image = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
      if (!image) return res.status(500).json({ error: "画像データがありません" });
      return res.status(200).json({ image });
    }

    // ---- 画像あり：編集モード（PNG/RGBAを想定） ----------
    // dataURL → Buffer
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl || "");
    if (!m) {
      return res.status(400).json({ error: "imageDataUrl が不正です（PNGのdataURLを送ってください）" });
    }
    const pngBuf = Buffer.from(m[1], "base64");

    // 画像編集は multipart/form-data
    const form = new FormData();
    form.set("model", "gpt-image-1");
    form.set("prompt", prompt);
    form.set("size", "1024x1024");
    form.set("image", new File([pngBuf], "image.png", { type: "image/png" }));

    const er = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: form
    });

    // JSON以外（HTMLエラーなど）も拾う
    const ct = er.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await er.json() : { error: await er.text() };

    if (!er.ok) {
      return res.status(er.status).json({ error: data?.error?.message || `OpenAI エラー（${er.status}）` });
    }

    const item = data?.data?.[0] || {};
    const image = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
    if (!image) return res.status(500).json({ error: "画像データがありません" });

    return res.status(200).json({ image });

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
