import os
import time
import requests
from datetime import datetime, timedelta

# -------------------- Config --------------------
BOT_TOKEN = os.environ['TG_BOT_TOKEN']
CHAT_ID = os.environ['TG_CHAT_ID']  # ej: -123456789
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"

# -------------------- Variables --------------------
message_id = None
message_timestamp = None  # datetime

# -------------------- Funciones --------------------
def get_prices():
    try:
        url = f"{COINGECKO_URL}?ids=ripple&vs_currencies=usd,eur&include_24hr_change=true"
        res = requests.get(url)
        res.raise_for_status()
        return res.json()['ripple']
    except Exception as e:
        print("❌ Error obteniendo precios:", e)
        return None

def format_text(r):
    arrow = "⬆️" if r['usd_24h_change'] >= 0 else "⬇️"
    return (
        f"📊 <b>XRP (Ripple)</b>\n"
        f"USD: <code>{r['usd']}</code>\n"
        f"EUR: <code>{r['eur']}</code>\n"
        f"Δ24h: <code>{r['usd_24h_change']:.2f}%</code> {arrow}\n\n"
        f"<i>Última actualización: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}</i>"
    )

def send_message(text):
    try:
        res = requests.post(f"{TELEGRAM_API}/sendMessage", json={
            "chat_id": CHAT_ID,
            "text": text,
            "parse_mode": "HTML"
        })
        res.raise_for_status()
        return res.json()['result']['message_id']
    except Exception as e:
        print("❌ Error enviando mensaje:", e)
        return None

def edit_message(msg_id, text):
    try:
        res = requests.post(f"{TELEGRAM_API}/editMessageText", json={
            "chat_id": CHAT_ID,
            "message_id": msg_id,
            "text": text,
            "parse_mode": "HTML"
        })
        res.raise_for_status()
    except Exception as e:
        print("❌ Error editando mensaje:", e)
        raise

def delete_message(msg_id):
    try:
        res = requests.post(f"{TELEGRAM_API}/deleteMessage", json={
            "chat_id": CHAT_ID,
            "message_id": msg_id
        })
        res.raise_for_status()
    except Exception as e:
        print("❌ Error borrando mensaje:", e)

# -------------------- Loop principal --------------------
while True:
    r = get_prices()
    if not r:
        time.sleep(60)
        continue

    text = format_text(r)

    # Si no hay mensaje o tiene más de 24h, enviar nuevo
    if message_id is None or (datetime.utcnow() - message_timestamp) > timedelta(hours=24):
        if message_id:
            delete_message(message_id)
        message_id = send_message(text)
        message_timestamp = datetime.utcnow()
    else:
        try:
            edit_message(message_id, text)
        except:
            # Si falla al editar, enviar uno nuevo
            message_id = send_message(text)
            message_timestamp = datetime.utcnow()

    time.sleep(60)
