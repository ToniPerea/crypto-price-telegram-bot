// mod.ts — Deno Deploy (TypeScript)
const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TG_CHAT_ID")!;
const COINGECKO_IDS = Deno.env.get("COINGECKO_IDS") ?? "ripple";
const VS_CURRENCIES = Deno.env.get("VS_CURRENCIES") ?? "usd,eur";

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("Faltan variables de entorno TG_BOT_TOKEN / TG_CHAT_ID");
  throw new Error("Configuración incompleta");
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const COINGECKO_SIMPLE_PRICE = "https://api.coingecko.com/api/v3/simple/price";

async function kv() {
  return await Deno.openKv();
}

async function getPrices() {
  const params = new URLSearchParams({
    ids: COINGECKO_IDS,
    vs_currencies: VS_CURRENCIES,
    include_24hr_change: "true"
  });
  const res = await fetch(`${COINGECKO_SIMPLE_PRICE}?${params.toString()}`, { timeout: 10000 });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function sendInitialMessage(text: string) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML"
    })
  });
  if (!res.ok) throw new Error(`Telegram sendMessage ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.result.message_id as number;
}

async function editMessage(message_id: number, text: string) {
  const res = await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      message_id,
      text,
      parse_mode: "HTML"
    })
  });
  
  if (!res.ok) {
    const body = await res.text();
    console.warn("editMessage failed:", res.status, body);
  } else {
    return await res.json();
  }
}

function formatText(data: any) {

  const ids = COINGECKO_IDS.split(",");
  const now = new Date().toUTCString();
  const lines = ["<b>📊 Precios</b>"];
  for (const id of ids) {
    const r = data[id.trim()];
    if (!r) continue;
    const parts: string[] = [];
    for (const cur of VS_CURRENCIES.split(",")) {
      const val = r[cur.trim()];
      if (val !== undefined) parts.push(`${cur.toUpperCase()}: <code>${Number(val).toLocaleString()}</code>`);
    }
    const change = r[`${VS_CURRENCIES.split(",")[0].trim()}_24h_change`];
    if (change !== undefined) parts.push(`Δ24h: <code>${Number(change).toFixed(2)}%</code>`);
    lines.push(`<b>${id.toUpperCase()}</b> — ${parts.join(" · ")}`);
  }
  lines.push("", `<i>Última actualización: ${now}</i>`);
  return lines.join("\n");
}

async function ensureMessageId(kvConn: Deno.Kv) {
  const key = ["telegram", "prices", "message_id"];
  const existing = await kvConn.get<number>(key);
  if (existing.value) return existing.value;
  const initialText = "Iniciando monitor de precios... ⏳";
  const msgId = await sendInitialMessage(initialText);
  await kvConn.set(key, msgId);
  return msgId;
}

Deno.cron("price-updater", "*/1 * * * *", async () => {
  const kvConn = await kv();
  try {
    const message_id = await ensureMessageId(kvConn);
    const data = await getPrices();
    const text = formatText(data);
    
    await editMessage(message_id, text);
    console.log("Editado message_id:", message_id, new Date().toISOString());
  } catch (err) {
    console.error("Error en cron:", err);
  } finally {
    kvConn.close?.();
  }
});

addEventListener("fetch", (e) => {
  e.respondWith(new Response("OK", { status: 200 }));
});
