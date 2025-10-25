// git-action/crypto-price-bot.ts - Bot de precios de criptomonedas para Telegram
const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TG_CHAT_ID")!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

const PERSON_1_NAME = Deno.env.get("PERSON_1_NAME");
const PERSON_1_VALUE = Deno.env.get("PERSON_1_VALUE");
const PERSON_2_NAME = Deno.env.get("PERSON_2_NAME");
const PERSON_2_VALUE = Deno.env.get("PERSON_2_VALUE");
const PERSON_3_NAME = Deno.env.get("PERSON_3_NAME");
const PERSON_3_VALUE = Deno.env.get("PERSON_3_VALUE");

interface MessageData {
  id: number;
  timestamp: number;
}

const LAST_MESSAGE_FILE = "./git-action/last_message.json";

// -------------------- Storage --------------------
async function getLastMessage(): Promise<MessageData | null> {
  try {
    const txt = await Deno.readTextFile(LAST_MESSAGE_FILE);
    return JSON.parse(txt) as MessageData;
  } catch {
    return null;
  }
}

async function setLastMessage(id: number) {
  const payload: MessageData = { id, timestamp: Date.now() };
  try {
    await Deno.writeTextFile(LAST_MESSAGE_FILE, JSON.stringify(payload, null, 2));
    console.log("DEBUG: escrito last_message.json");
  } catch (e) {
    console.error("Error escribiendo last_message.json:", e);
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

function formatPersonPortfolio(name: string, amount: number, xrpData: any): string[] {
  const valueEur = amount * xrpData.eur;
  const change24h = (valueEur * xrpData.usd_24h_change) / 100;
  const arrow = change24h >= 0 ? "⬆️" : "⬇️";
  
  return [
    `💼 <b>${name}</b>`,
    `XRP: <code>${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XRP</code>`,
    `Valor: <code>€${valueEur.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</code>`,
    `Δ24h: <code>€${Math.abs(change24h).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${xrpData.usd_24h_change.toFixed(2)}%)</code> ${arrow}`,
    ""
  ];
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

  // Sección de portfolios personales
  const xrpData = data["ripple"];
  if (xrpData && (PERSON_1_NAME || PERSON_2_NAME)) {
    lines.push("─────────────────────────", "");
    lines.push("👥 <b>Portfolios XRP</b>", "");

    if (PERSON_1_NAME && PERSON_1_VALUE) {
      lines.push(...formatPersonPortfolio(PERSON_1_NAME, parseFloat(PERSON_1_VALUE), xrpData));
    }

    if (PERSON_2_NAME && PERSON_2_VALUE) {
      lines.push(...formatPersonPortfolio(PERSON_2_NAME, parseFloat(PERSON_2_VALUE), xrpData));
    }

    if (PERSON_3_NAME && PERSON_3_VALUE) {
      lines.push(...formatPersonPortfolio(PERSON_3_NAME, parseFloat(PERSON_3_VALUE), xrpData));
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
    await unpinMessage(message.id).catch(() => {});
    await deleteMessage(message.id).catch(() => {});
    const id = await sendMessage(text);
    await setLastMessage(id);
    await pinMessage(id);
    console.log("Mensaje viejo reemplazado:", id);
  } else {
    try {
      await editMessage(message.id, text);
      await pinMessage(message.id);
      console.log("Mensaje editado:", message.id);
    } catch (e: any) {
      console.error("Error editando mensaje:", e);
      if (String(e).includes("not found") || String(e).includes("Bad Request")) {
        const id = await sendMessage(text);
        await setLastMessage(id);
        await pinMessage(id);
        console.log("Mensaje no encontrado, enviado nuevo:", id);
      }
    }
  }
}

// -------------------- Entrypoint --------------------
(async () => {
  try {
    const prices = await getPrices();
    const text = formatText(prices);
    await sendOrUpdateMessage(text);
  } catch (e) {
    console.error("Error en bot:", e);
  }
})();
