// crypto-price-bot.ts - Bot de Telegram en TypeScript para Deno Deploy
const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TG_CHAT_ID")!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

// -------------------- Interfaces --------------------
interface MessageData {
  id: number;
  timestamp: number; // ms desde epoch
}

// -------------------- Deno KV --------------------
async function getKv() {
  return await Deno.openKv();
}

async function getLastMessage(): Promise<MessageData | null> {
  try {
    const kv = await getKv();
    const res = await kv.get(["xrp_bot", "lastMessage"]);
    return res.value ?? null;
  } catch (e) {
    console.error("❌ Error leyendo KV:", e);
    return null;
  }
}

async function setLastMessage(id: number) {
  try {
    const kv = await getKv();
    await kv.set(["xrp_bot", "lastMessage"], { id, timestamp: Date.now() });
  } catch (e) {
    console.error("❌ Error guardando KV:", e);
  }
}

// -------------------- Telegram --------------------
async function sendMessage(text: string) {
  try {
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
  } catch (e) {
    console.error("❌ Error enviando mensaje:", e);
    throw e;
  }
}

async function editMessage(msgId: number, text: string) {
  try {
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
  } catch (e) {
    console.error("❌ Error editando mensaje:", e);
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
  } catch (e) {
    console.error("❌ Error borrando mensaje:", e);
  }
}

// -------------------- CoinGecko --------------------
async function getPrices() {
  try {
    const url = `${COINGECKO_URL}?ids=ripple&vs_currencies=usd,eur&include_24hr_change=true`;
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
async function sendOrUpdateMessage(text: string) {
  try {
    let message = await getLastMessage();

    if (!message) {
      // No hay mensaje previo, enviar uno nuevo
      const id = await sendMessage(text);
      await setLastMessage(id);
      console.log("✅ Mensaje inicial enviado:", id);
      return;
    }

    const ageHours = (Date.now() - message.timestamp) / 1000 / 3600;

    if (ageHours >= 24) {
      // Mensaje viejo → borrar y enviar nuevo
      await deleteMessage(message.id);
      const id = await sendMessage(text);
      await setLastMessage(id);
      console.log("♻️ Mensaje viejo reemplazado por nuevo:", id);
    } else {
      // Mensaje reciente → intentar editar
      try {
        await editMessage(message.id, text);
        console.log("✏️ Mensaje editado correctamente:", message.id);
      } catch (e: any) {
        if (e.message.includes("not found")) {
          const id = await sendMessage(text);
          await setLastMessage(id);
          console.log("❌ Mensaje no encontrado, enviado nuevo:", id);
        } else {
          console.error("❌ Error editando mensaje:", e);
        }
      }
    }
  } catch (e) {
    console.error("❌ Error sendOrUpdateMessage:", e);
  }
}

// -------------------- Loop interno --------------------
async function loop() {
  try {
    const prices = await getPrices();
    if (!prices) {
      console.log("❌ No se pudo obtener precios, reintentando en 60s...");
    } else {
      const text = formatText(prices);
      await sendOrUpdateMessage(text);
    }
  } catch (e) {
    console.error("❌ Error inesperado en loop:", e, e.stack);
  } finally {
    setTimeout(loop, 60_000); // reintentar cada minuto
  }
}

// Iniciar loop
loop();

// -------------------- Servidor HTTP mínimo --------------------
Deno.serve((_req) => new Response("Bot XRP corriendo ✅"));
