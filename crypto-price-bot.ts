const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TG_CHAT_ID")!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

// -------------------- Deno KV para guardar el último message_id --------------------
async function getKv() {
  return await Deno.openKv();
}

async function getLastMessageId(): Promise<number | null> {
  try {
    const kv = await getKv();
    const res = await kv.get(["xrp_bot", "lastMessageId"]);
    return res.value ?? null;
  } catch (e) {
    console.error("❌ Error leyendo KV:", e);
    return null;
  }
}

async function setLastMessageId(id: number) {
  try {
    const kv = await getKv();
    await kv.set(["xrp_bot", "lastMessageId"], id);
  } catch (e) {
    console.error("❌ Error guardando KV:", e);
  }
}

// -------------------- CoinGecko --------------------
async function getPrices() {
  try {
    const res = await fetch(`${COINGECKO_URL}?ids=ripple&vs_currencies=usd,eur&include_24hr_change=true`);
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

// -------------------- Telegram --------------------
async function sendMessage(text: string) {
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.description);
    return j.result.message_id;
  } catch (e) {
    console.error("❌ Error enviando mensaje:", e);
    throw e;
  }
}

async function deleteMessage(msgId: number) {
  try {
    const res = await fetch(`${TELEGRAM_API}/deleteMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, message_id: msgId })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.description);
    console.log("🗑️ Mensaje antiguo eliminado:", msgId);
  } catch (e) {
    console.error("❌ Error borrando mensaje:", e);
  }
}

// -------------------- Función principal --------------------
async function sendNewMessage() {
  try {
    // Obtener precio
    const prices = await getPrices();
    if (!prices) return;

    const text = formatText(prices);

    // Intentar eliminar mensaje antiguo
    const lastMessageId = await getLastMessageId();
    if (lastMessageId) {
      await deleteMessage(lastMessageId);
    }

    // Enviar mensaje nuevo
    const newMessageId = await sendMessage(text);
    await setLastMessageId(newMessageId);

  } catch (e) {
    console.error("❌ Error en sendNewMessage:", e);
  }
}

// -------------------- Loop cada minuto --------------------
async function loop() {
  try {
    await sendNewMessage();
  } catch (e) {
    console.error("❌ Error inesperado en loop:", e);
  } finally {
    setTimeout(loop, 60_000); // reintentar cada minuto
  }
}

loop();
Deno.serve((_req) => new Response("Bot XRP corriendo ✅"));
