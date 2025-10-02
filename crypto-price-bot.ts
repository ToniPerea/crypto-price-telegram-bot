// crypto-price-bot.ts - Bot de Telegram en TypeScript para Deno Deploy
const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TG_CHAT_ID")!; // ej: -123456789
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

// Obtener precios de XRP
async function getPrices() {
  const url = `${COINGECKO_URL}?ids=ripple&vs_currencies=usd,eur&include_24hr_change=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  return await res.json() as { ripple: { usd: number; eur: number; usd_24h_change: number } };
}

// Formatear texto del mensaje
function formatText(data: ReturnType<typeof getPrices> extends Promise<infer R> ? R : any) {
  const r = data.ripple;
  return [
    "📊 <b>XRP (Ripple)</b>",
    `USD: <code>${r.usd}</code>`,
    `EUR: <code>${r.eur}</code>`,
    `Δ24h: <code>${r.usd_24h_change.toFixed(2)}%</code>`,
    "",
    `<i>Última actualización: ${new Date().toUTCString()}</i>`
  ].join("\n");
}

// Obtener o crear message_id en KV
async function ensureMessageId(kv: Deno.Kv): Promise<number> {
  const key: [string, string, string] = ["telegram", "xrp", "msg_id"];
  const entry = await kv.get(key);
  if (entry.value) return entry.value as number;

  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: "Iniciando monitor de XRP... ⏳",
      parse_mode: "HTML"
    })
  });
  const j = await res.json();
  const msgId = j.result.message_id as number;
  await kv.set(key, msgId);
  return msgId;
}

// Editar mensaje existente
async function editMessage(msgId: number, text: string) {
  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      message_id: msgId,
      text,
      parse_mode: "HTML"
    })
  });
}

// Cron oficial Deno: cada minuto
Deno.cron("update-xrp", "*/1 * * * *", async () => {
  const kv = await Deno.openKv();
  try {
    const msgId = await ensureMessageId(kv);
    const prices = await getPrices();
    const text = formatText(prices);
    await editMessage(msgId, text);
    console.log("Mensaje actualizado:", new Date().toISOString());
  } catch (e) {
    console.error("Error en cron:", e);
  } finally {
    kv.close?.();
  }
});

// Servidor HTTP mínimo para que Deploy lo acepte
Deno.serve((_req) => new Response("Bot XRP corriendo ✅"));
