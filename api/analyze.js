export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY nije postavljen u Vercel environment varijablama." });
  }

  const { images, komentar } = req.body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: "Nedostaju slike." });
  }

  const komentarSection = komentar && komentar.trim()
    ? `\n\nSPECIJALNA UPUTSTVA OD KORISNIKA (obavezno poštuj):\n${komentar.trim()}`
    : "";

  const pageCount = images.length;
  const prompt = `You are an invoice parser. You are given ${pageCount} page(s) of the same invoice. Treat all pages as one single invoice and extract ALL line items across all pages, then group similar items together.

Use AI judgment to group similar products intelligently. For example:
- All variants of "zenski ves" (like "216 zenski ves", "3013 zenski ves", "218 zenski ves", "1900-M zenski ves" etc.) → group as "Zenski ves"
- All variants of "zenska pidzama" → group as "Zenska pidzama"
- Keep distinct products separate (carapa, boxerica, spavacica etc.)

For each group: sum all quantities across all pages, sum all ukupno values, calculate weighted average price.${komentarSection}

Return ONLY valid JSON (no markdown, no backticks, no explanation):
{"vendor":"vendor name if visible","currency":"EUR","groups":[{"naziv":"clean group name","kolicina":100,"jm":"1/1","cena":5.50,"ukupno":550.00,"stavke":3}],"ukupno_sve":1234.50}`;

  const content = [
    ...images.map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.base64 }
    })),
    { type: "text", text: prompt }
  ];

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "API greška" });
    }

    const textBlock = data.content?.find((b) => b.type === "text");
    if (!textBlock) {
      return res.status(500).json({ error: "Prazan odgovor od AI." });
    }

    let raw = textBlock.text.trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    JSON.parse(raw);

    return res.status(200).json(JSON.parse(raw));

  } catch (err) {
    return res.status(500).json({ error: "Serverska greška: " + err.message });
  }
}
