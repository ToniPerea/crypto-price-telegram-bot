// crypto-price-bot.ts - compatible Deno Deploy <-> GitHub Actions
const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TG_CHAT_ID")!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

interface MessageData {
  id: number;
  timestamp: number;
}

const IS_GITHUB_ACTIONS = Deno.env.get("GITHUB_ACTIONS") === "true";
const GITHUB_WORKSPACE = Deno.env.get("GITHUB_WORKSPACE") ?? "."; // en Actions apunta al workspace
const LAST_MESSAGE_FILE = `${GITHUB_WORKSPACE}/.github/last_message.json`;

// -------------------- Storage (KV en Deploy, fichero en Actions) --------------------
async function getLastMessage(): Promise<MessageData | null> {
  if (IS_GITHUB_ACTIONS) {
    try {
      const txt = await Deno.readTextFile(LAST_MESSAGE_FILE);
      return JSON.parse(txt) as MessageData;
    } catch {
      return null;
    }
  } else {
    try {
      const kv = await Deno.openKv();
      const res = await kv.get(["xrp_bot", "lastMessage"]);
      return res.value ?? null;
    } catch (e) {
      console.error("Error leyendo KV:", e);
      return null;
    }
  }
}

async function setLastMessage(id: number) {
  const payload: MessageData = { id, timestamp: Date.now() };
  if (IS_GITHUB_ACTIONS) {
    try {
      // Asegurarnos de que la carpeta existe
      try { await Deno.readDir(`${GITHUB_WORKSPACE}/.github`); } catch { await Deno.mkdir(`${GITHUB_WORKSPACE}/.github`, { recursive: true }); }
      await Deno.writeTextFile(LAST_MESSAGE_FILE, JSON.stringify(payload));
    } catch (e) {
      console.error("Error guardando fichero last_message:", e);
    }
  } else {
    try {
      const kv = await Deno.openKv();
      await kv.set(["xrp_bot", "lastMessage"], payload);
    } catch (e) {
      console.error("Error guardando KV:", e);
    }
  }
}

// -------------------- Telegram helpers --------------------
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
    if (!j.ok) console.error("⚠️ No se pudo pinear:", j.description);
  } catch (e) {
    console.error("❌ Error pineando:", e);
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
    if (!j.ok) console.error("⚠️ No se pudo despinear:", j.description);
  } catch (e) {
    console.error("❌ Error despineando:", e);
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
    { id: "bitcoin", symbol: "BTC", emoji: "₿" },
    { id: "ripple", symbol: "XRP", emoji: "💧" },
    { id: "linea", symbol: "LINEA", emoji: "🔷" },
    { id: "stellar", symbol: "XLM", emoji: "🌟" },
    { id: "cardano", symbol: "ADA", emoji: "🔵" }
  ];

  const lines = ["📊 <b>Precios de Criptomonedas</b>", ""];

  for (const coin of coins) {
    const d = data[coin.id];
    if (d) {
      const arrow = d.usd_24h_change >= 0 ? "⬆️" : "⬇️";
      lines.push(
        `${coin.emoji} <b>${coin.symbol}</b>`,
        `USD: <code>$${Number(d.usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</code>`,
        `EUR: <code>€${Number(d.eur).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</code>`,
        `Δ24h: <code>${Number(d.usd_24h_change).toFixed(2)}%</code> ${arrow}`,
        ""
      );
    }
  }

  const spainTime = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'short',
    timeStyle: 'medium'
  });
  lines.push(`<i>Última actualización: ${spainTime} (España)</i>`);
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
    console.log("Mensaje inicial enviado:", id);
    return;
  }

  const ageHours = (now - message.timestamp) / 1000 / 3600;

  if (ageHours >= 46) {
    // Despinear y borrar el mensaje antiguo
    try { await unpinMessage(message.id); } catch {}
    try { await deleteMessage(message.id); } catch {}
    const id = await sendMessage(text);
    await setLastMessage(id);
    await pinMessage(id);
    console.log("Mensaje viejo reemplazado:", id);
  } else {
    try {
      await editMessage(message.id, text);
      // asegurar pineado
      try { await pinMessage(message.id); } catch {}
      console.log("Mensaje editado:", message.id);
    } catch (e: any) {
      if (String(e).includes("not found") || String(e).includes("Bad Request")) {
        // enviar nuevo si no existe
        const id = await sendMessage(text);
        await setLastMessage(id);
        await pinMessage(id);
        console.log("Mensaje no encontrado, enviado nuevo:", id);
      } else {
        console.error("Error editando mensaje:", e);
      }
    }
  }
}

// -------------------- Entrypoint --------------------
if (IS_GITHUB_ACTIONS) {
  // En Actions ejecutamos una sola vez (no loop). El workflow se encarga del schedule.
  (async () => {
    try {
      const prices = await getPrices();
      const text = formatText(prices);
      await sendOrUpdateMessage(text);
    } catch (e) {
      console.error("Error en job Actions:", e);
    }
  })();
} else {
  // En Deno Deploy o local: mantenemos loop para compatibilidad
  (async function loop() {
    try {
      const prices = await getPrices();
      const text = formatText(prices);
      await sendOrUpdateMessage(text);
    } catch (e) {
      console.error("Error en loop:", e);
    } finally {
      setTimeout(loop, 60_000);
    }
  })();
  Deno.serve((_req) => new Response("Bot corriendo ✅"));
}
