const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TG_CHAT_ID")!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

interface MessageData {
  id: number;
  timestamp: number;
}

// -------------------- KV --------------------
async function getLastMessage(): Promise<MessageData | null> {
  try {
    const kv = await Deno.openKv();
    const res = await kv.get(["xrp_bot", "lastMessage"]);
    return res.value ?? null;
  } catch {
    return null;
  }
}

async function setLastMessage(id: number) {
  const kv = await Deno.openKv();
  await kv.set(["xrp_bot", "lastMessage"], { id, timestamp: Date.now() });
}

// -------------------- Telegram --------------------
async function sendMessage(text: string) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" })
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.description);
  return j.result.message_id;
}

async function editMessage(msgId: number, text: string) {
  const res = await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, message_id: msgId, text, parse_mode: "HTML" })
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.description);
  return j;
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
    console.error("Error borrando mensaje:", e);
  }
}

async function pinMessage(msgId: number) {
  try {
    const res = await fetch(`${TELEGRAM_API}/pinChatMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, message_id: msgId, disable_notification: true })
    });
    const j = await res.json();
    if (!j.ok) {
      console.error("⚠️ No se pudo pinear mensaje:", j.description);
    } else {
      console.log("📌 Mensaje pineado:", msgId);
    }
  } catch (e) {
    console.error("❌ Error pineando mensaje:", e);
  }
}

async function unpinMessage(msgId: number) {
  try {
    const res = await fetch(`${TELEGRAM_API}/unpinChatMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, message_id: msgId })
    });
    const j = await res.json();
    if (!j.ok) {
      console.error("⚠️ No se pudo despinear mensaje:", j.description);
    } else {
      console.log("📍 Mensaje despineado:", msgId);
    }
  } catch (e) {
    console.error("❌ Error despineando mensaje:", e);
  }
}

// -------------------- CoinGecko --------------------
async function getPrices() {
  const ids = "bitcoin,ripple,linea,stellar,cardano";
  const res = await fetch(`${COINGECKO_URL}?ids=${ids}&vs_currencies=usd,eur&include_24hr_change=true`);
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  return await res.json();
}

function formatText(data: any) {
  const coins = [
    { id: "bitcoin", symbol: "BTC", name: "Bitcoin", emoji: "₿" },
    { id: "ripple", symbol: "XRP", name: "Ripple", emoji: "💧" },
    { id: "linea", symbol: "LINEA", name: "Linea", emoji: "🔷" },
    { id: "stellar", symbol: "XLM", name: "Stellar", emoji: "🌟" },
    { id: "cardano", symbol: "ADA", name: "Cardano", emoji: "🔵" }
  ];

  const lines = ["📊 <b>Precios de Criptomonedas</b>", ""];

  for (const coin of coins) {
    const d = data[coin.id];
    if (d) {
      const arrow = d.usd_24h_change >= 0 ? "⬆️" : "⬇️";
      lines.push(
        `${coin.emoji} <b>${coin.symbol}</b>`,
        `USD: <code>$${d.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</code>`,
        `EUR: <code>€${d.eur.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</code>`,
        `Δ24h: <code>${d.usd_24h_change.toFixed(2)}%</code> ${arrow}`,
        ""
      );
    }
  }

  lines.push(`<i>Última actualización: ${new Date().toUTCString()}</i>`);
  return lines.join("\n");
}

// -------------------- Enviar o actualizar mensaje --------------------
async function sendOrUpdateMessage(text: string) {
  let message = await getLastMessage();
  const now = Date.now();

  if (!message) {
    const id = await sendMessage(text);
    await setLastMessage(id);
    await pinMessage(id);
    return;
  }

  const ageHours = (now - message.timestamp) / 1000 / 3600;

  if (ageHours >= 24) {
    // Despinear y borrar el mensaje antiguo
    await unpinMessage(message.id);
    await deleteMessage(message.id);

    // Enviar nuevo y pinearlo
    const id = await sendMessage(text);
    await setLastMessage(id);
    await pinMessage(id);
  } else {
    try {
      await editMessage(message.id, text);
      await pinMessage(message.id); // asegurar que siga pineado
    } catch (e: any) {
      if (e.message.includes("not found")) {
        const id = await sendMessage(text);
        await setLastMessage(id);
        await pinMessage(id);
      } else {
        console.error("Error editando mensaje:", e);
      }
    }
  }
}

// -------------------- Loop --------------------
async function loop() {
  try {
    const prices = await getPrices();
    const text = formatText(prices);
    await sendOrUpdateMessage(text);
  } catch (e) {
    console.error("Error en loop:", e);
  } finally {
    setTimeout(loop, 60_000);
  }
}

loop();
Deno.serve((_req) => new Response("Bot XRP corriendo ✅"));
