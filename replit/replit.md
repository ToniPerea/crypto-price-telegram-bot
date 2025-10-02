# Crypto Price Bot (XRP/Ripple)

## Overview
A Telegram bot that posts real-time XRP (Ripple) cryptocurrency prices from CoinGecko. The bot updates prices every minute and manages a single Telegram message that gets updated regularly. After 24 hours, it deletes the old message and creates a fresh one.

## Project Structure
- `typescript/crypto-price-bot.ts` - Main Deno/TypeScript implementation (currently active)
- `typescript/deno.json` - Deno configuration with unstable features
- `python/crypto-price-bot.py` - Alternative Python implementation (not currently used)

## Technology Stack
- **Runtime**: Deno (TypeScript)
- **State Storage**: Deno KV (key-value store for message ID persistence)
- **External APIs**:
  - CoinGecko API - cryptocurrency price data
  - Telegram Bot API - message sending/updating

## Required Environment Variables
The bot requires two Telegram-related secrets to function:

1. **TG_BOT_TOKEN** - Your Telegram Bot API token
   - Get this from [@BotFather](https://t.me/botfather) on Telegram
   - Format: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`

2. **TG_CHAT_ID** - The Telegram chat/channel ID where messages will be posted
   - For groups/channels: negative number (e.g., `-1001234567890`)
   - For private chats: positive number (e.g., `123456789`)

### How to Set Up Secrets
1. Click on the **Secrets** tab in the left sidebar (🔒 icon)
2. Add both secrets:
   - Key: `TG_BOT_TOKEN`, Value: your bot token from BotFather
   - Key: `TG_CHAT_ID`, Value: your chat ID

## Deployment Configuration
This bot is configured to run as a **VM deployment** because:
- It maintains state in Deno KV
- Runs continuously with a 60-second loop
- Needs to persist message IDs between runs

The bot also serves an HTTP endpoint on port 8000 to confirm it's running.

## Current Status
- ✅ Deno runtime installed
- ✅ Workflow configured and running
- ⚠️ **Secrets need to be configured** - The bot will show "Not Found" errors until you add the Telegram credentials

## Recent Changes
- **2025-10-02**: Initial Replit environment setup
  - Installed Deno runtime
  - Configured workflow for TypeScript version
  - Created .gitignore for Deno projects
  - Set up deployment configuration
