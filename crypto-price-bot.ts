// crypto-price-bot.ts - Bot de Telegram en TypeScript para Deno Deploy
const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TG_CHAT_ID")!; // ej: -123456789
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

// Variable para guardar el último message_id en memoria
let lastMessageId: number | null = null;

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

// Editar mensaje existente
async function editMessage(msgId: number, text: string) {
  const res = await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      message_id: msgId,
      text,
      parse_mode: "HTML"
    })
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.description);
  return j;
}

// Enviar mensaje nuevo
async function sendMessage(text: string) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML"
    })
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.description);
  return j.result.message_id;
}

// Función que edita o envía según corresponda
async function sendOrEditMessage(text: string) {
  try {
    if (lastMessageId) {
      await editMessage(lastMessageId, text);
    } else {
      lastMessageId = await sendMessage(text);
    }
  } catch (e: any) {
    if (e.message.includes("not found")) {
      // Si no se encuentra el mensaje, enviar uno nuevo
      lastMessageId = await sendMessage(text);
    } else {
      throw e;
    }
  }
}

// Cron oficial Deno: cada minuto
Deno.cron("update-xrp", "*/1 * * * *", async () => {
  try {
    console.log("Actualizando precios...");
    const prices = await getPrices();
    const text = formatText(prices);
    await sendOrEditMessage(text);
    console.log("✅ Mensaje actualizado:", new Date().toISOString());
  } catch (e) {
    console.error("❌ Error en cron:", e);
  }
});

// Servidor HTTP mínimo para que Deploy lo acepte
Deno.serve((_req) => new Response("Bot XRP corriendo ✅"));
