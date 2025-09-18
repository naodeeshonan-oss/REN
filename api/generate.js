// /api/generate.js
export const config = { api: { bodyParser: false } };

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      // FormDataを手で読む代わりに、Node 18+ の Request を使う
      try{
        const u = new URL(req.url, "http://x");
        const boundary = req.headers["content-type"]?.match(/boundary=(.*)$/)?.[1];
        if(!boundary) return reject(new Error("no boundary"));
        const blob = new Blob(chunks, { type: req.headers["content-type"] });
        const form = await (new Response(blob)).formData();

        const prompt = form.get("prompt") || "";
        const options = JSON.parse(form.get("options") || "{}");
        const file = form.get("image"); // may be null (no file)

        resolve({ prompt:String(prompt), options, file });
      }catch(err){ reject(err); }
    });
    req.on("error", reject);
  });
}

function cleanseKey(raw) {
  return (raw||"").replace(/^export\s+/i,"").replace(/^OPENAI_API_KEY\s*=\s*/i,"").trim();
}

function buildPrompt(basePrompt, options, isEdit){
  const lines = [];

  // ユーザーの指示
  lines.push(basePrompt);

  // プリセット
  const p = options?.preset || "";
  const presets = {
    "anime-soft":"gentle anime style, soft lines, clean colors, subtle cel shading",
    "watercolor":"delicate watercolor style, soft edges, paper texture, light pastel tones",
    "pixar-soft":"pixar-like friendly vibe, soft lighting, round shapes, but subtle",
    "ghibli-soft":"ghibli-inspired warm tone, hand-painted feeling, but subtle"
  };
  if (p && presets[p]) lines.push(presets[p]);

  // トーン調整
  if (options?.lite)  lines.push("enhance aesthetics only by ~20%, keep it natural");
  if (options?.smile) lines.push("make expression a natural slight smile, not exaggerated");
  if (options?.clean) lines.push("gently improve skin and hair, avoid over-smoothing");

  // 本人の特徴は残す（編集時は特に強く）
  if (isEdit && options?.lockFace !== false) {
    lines.push(
      "STRICT: preserve the subject's identity and likeness (>95%).",
      "Do not change face shape, age, gender, skin tone, eye shape, nose, or hairstyle length.",
      "No gender-swap, no age-shift, no different person. Keep original pose and camera angle when possible.",
      "Apply only a gentle stylistic treatment over the original."
    );
  }

  // スタイル強め（デフォルトOFF）
  if (options?.strongStyle) {
    lines.push("You may push style slightly stronger, but still keep identity recognizable.");
  }

  return lines.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  try {
    const { prompt, options, file } = await parseForm(req);

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt を入れてください" });
    }

    // APIキー
    let apiKey = cleanseKey(process.env.OPENAI_API_KEY);
    if (!apiKey || !apiKey.startsWith("sk-")) {
      return res.status(500).json({ error: "OPENAI_API_KEY が未設定または不正です" });
    }

    // 画像編集か、新規生成か
    const isEdit = !!(file && typeof file === "object" && file.name);

    // 画像ファイルの前処理（必要最低限：MIMEチェック）
    let formData = new FormData();
    const finalPrompt = buildPrompt(prompt, options, isEdit);

    if (isEdit) {
      // JPEG/PNG/WEBP のみ許可（iOSでoctet-streamになる場合は拡張子で救済）
      const mime = (file.type || "").toLowerCase();
      const name = String(file.name || "");
      const okByMime = /image\/(jpeg|png|webp)/.test(mime);
      const okByExt  = /\.(jpg|jpeg|png|webp)$/i.test(name);
      if (!okByMime && !okByExt) {
        return res.status(400).json({ error: "画像形式は JPEG / PNG / WebP のみ対応です" });
      }

      formData.append("model","gpt-image-1");
      formData.append("prompt", finalPrompt);
      formData.append("image[]", file, name || "image");
      formData.append("size","1024x1024");
      formData.append("quality","high");
      // response_format は指定しない（URLかbase64のどちらでも拾えるように）

      const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData
      });

      const data = await r.json().catch(()=> ({}));
      if (!r.ok) {
        // OpenAIの英語エラーを和訳ぎみに
        return res.status(r.status).json({ error: data?.error?.message || "OpenAI 編集APIエラー" });
      }
      const item = data?.data?.[0] || {};
      const image = item.url ? item.url : (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
      if (!image) return res.status(500).json({ error: "画像データがありません" });
      return res.status(200).json({ image });
    } else {
      // 新規生成
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: finalPrompt,
          size: "1024x1024",
          quality: "high"
        })
      });

      const data = await r.json().catch(()=> ({}));
      if (!r.ok) {
        return res.status(r.status).json({ error: data?.error?.message || "OpenAI 生成APIエラー" });
        }
      const item = data?.data?.[0] || {};
      const image = item.url ? item.url : (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
      if (!image) return res.status(500).json({ error: "画像データがありません" });
      return res.status(200).json({ image });
    }
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
