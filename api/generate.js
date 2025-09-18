// api/generate.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  try {
    const { prompt, imageDataUrl } = await readJson(req);

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt を入れてください" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY が未設定です（Vercel に入れてください）" });
    }

    // 画像が付いていたら「編集モード」, なければ「新規生成」
    if (imageDataUrl) {
      // DataURL → PNGバイナリ
      const pngBuffer = dataURLtoBuffer(imageDataUrl);

      // multipart/form-data で /images/edits に投げる
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", prompt);
      form.append("size", "1024x1024");
      form.append("image", new Blob([pngBuffer], { type: "image/png" }), "image.png");

      const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });

      const data = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({ error: data?.error?.message || "OpenAI エラー (edits)" });
      }

      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) return res.status(500).json({ error: "画像データがありません(edits)" });

      return res.status(200).json({ image: `data:image/png;base64,${b64}` });
    } else {
      // 新規生成: /images/generations
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          size: "1024x1024",
          quality: "high",
          response_format: "b64_json",
        }),
      });

      const data = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({ error: data?.error?.message || "OpenAI エラー (generations)" });
      }

      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) return res.status(500).json({ error: "画像データがありません(generations)" });

      return res.status(200).json({ image: `data:image/png;base64,${b64}` });
    }
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

// -------- helpers --------
function dataURLtoBuffer(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) throw new Error("DataURL が不正です");
  const b64 = dataUrl.slice(comma + 1);
  return Buffer.from(b64, "base64");
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        reject(new Error("JSON をパースできません"));
      }
    });
    req.on("error", reject);
  });
}
