// crypto-price-bot.ts - Bot de Telegram en TypeScript para Deno Deploy
const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TG_CHAT_ID")!; // ej: -123456789
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

// -------------------- Funciones para Deno KV --------------------
async function getKv() {
  return await Deno.openKv();
}

async function getLastMessageId(): Promise<number | null> {
  const kv = await getKv();
  const res = await kv.get(["xrp_bot", "lastMessageId"]);
  return res.value ?? null;
}

async function setLastMessageId(id: number) {
  const kv = await getKv();
  await kv.set(["xrp_bot", "lastMessageId"], id);
}

// -------------------- Funciones de Telegram --------------------
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

// -------------------- Función de precios --------------------
async function getPrices() {
  const url = `${COINGECKO_URL}?ids=ripple&vs_currencies=usd,eur&include_24hr_change=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
    return await res.json() as { ripple: { usd: number; eur: number; usd_24h_change: number } };
  } catch (e) {
    console.error("❌ Error obteniendo precios:", e);
    return null;
  }
}

function formatText(data: { ripple: { usd: number; eur: number; usd_24h_change: number } }) {
  const r = data.ripple;
  const arrow = r.usd_24h_change >= 0 ? "⬆️" : "⬇️";
  return [
    "📊 <b>XRP (Ripple)</b>",
    `USD: <code>${r.usd}</code>`,
    `EUR: <code>${r.eur}</code>`,
    `Δ24h: <code>${r.usd_24h_change.toFixed(2)}%</code> ${arrow}`,
    "",
    `<i>Última actualización: ${new Date().toUTCString()}</i>`
  ].join("\n");
}

// -------------------- Función principal --------------------
async function sendOrEditMessage(text: string) {
  let messageId = await getLastMessageId();

  try {
    if (messageId) {
      await editMessage(messageId, text);
    } else {
      messageId = await sendMessage(text);
      await setLastMessageId(messageId);
    }
  } catch (e: any) {
    if (e.message.includes("not found")) {
      messageId = await sendMessage(text);
      await setLastMessageId(messageId);
    } else {
      throw e;
    }
  }
}

// -------------------- Loop interno en lugar de cron --------------------
async function loop() {
  try {
    const prices = await getPrices();
    if (!prices) {
      console.log("❌ No se pudo obtener precios, reintentando en 60s...");
    } else {
      const text = formatText(prices);
      await sendOrEditMessage(text);
      console.log("✅ Mensaje actualizado:", new Date().toISOString());
    }
  } catch (e) {
    console.error("❌ Error en loop:", e, e.stack);
  } finally {
    // Ejecutar de nuevo en 60 segundos
    setTimeout(loop, 60_000);
  }
}

// Iniciar loop
loop();

// -------------------- Servidor HTTP mínimo --------------------
Deno.serve((_req) => new Response("Bot XRP corriendo ✅"));
