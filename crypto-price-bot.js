// mod.js - Bot de Telegram en JS (para Deno Deploy)
const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN");
const CHAT_ID   = Deno.env.get("TG_CHAT_ID"); // ej: -123456789
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

async function getPrices() {
  const url = `${COINGECKO_URL}?ids=ripple&vs_currencies=usd,eur&include_24hr_change=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  return await res.json();
}

function formatText(data) {
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

async function ensureMessageId(kv) {
  const key = ["telegram", "xrp", "msg_id"];
  const entry = await kv.get(key);
  if (entry.value) return entry.value;

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
  const msgId = j.result.message_id;
  await kv.set(key, msgId);
  return msgId;
}

async function editMessage(msgId, text) {
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

// Tarea programada cada minuto
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

// Respuesta básica a peticiones HTTP (para que el proyecto sea accesible)
Deno.serve((_req) => new Response("Bot XRP corriendo ✅"));
