// /api/interrogate.js
export const config = { api: { bodyParser: true } };

function cleanseKey(raw) {
  return (raw || "")
    .replace(/^export\s+/i, "")
    .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
    .trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    // ブラウザで直接開いたときの確認用メッセージ
    return res.status(405).json({ error: "POSTのみ" });
  }
  try {
    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl) return res.status(400).json({ error: "imageDataUrl が必要です" });

    const apiKey = cleanseKey(process.env.OPENAI_API_KEY);
    if (!apiKey?.startsWith("sk-")) {
      return res.status(500).json({ error: "OPENAI_API_KEY 未設定" });
    }

    // 画像を見て「タグっぽい短い説明」を返す
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Describe this image as concise, comma-separated tags for anime-style generation. No sentences. 30~60 tokens.",
              },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        temperature: 0.2,
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error?.message || "interrogate失敗" });
    }

    const tags = data?.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ tags });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
