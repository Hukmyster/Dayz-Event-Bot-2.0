# Dayz-Event-Bot-2.0

index.js: boot, client, startup modules, ready event, and one forwarder.

indexcommands.js: the bridge that wires interaction handling together.

indexcommandscore.js: autocomplete, reply helpers, toggle helpers, and button routing.

indexcommandslist.js: the long command switch/if chain and command execution logic.                      


# DayZ Event Bot 2.0

A **Node.js Discord bot** designed for **Nitrado-hosted DayZ private servers**. It monitors server logs in real-time and delivers:

- **Kill Feed** – Player vs Player (and explosive) kills with weapon, distance, and iZurvive map links
- **Event Feed** – Loot crates, zombie hordes, airdrops and other custom events
- **Player Radars** – Custom zones that alert a webhook when players enter (with admin controls and ignore lists)

---

## Features

- Real-time parsing of `.adm` and `.rpt` log files via Nitrado API
- Clean Discord embeds with iZurvive map integration
- Advanced player radar system (persistent JSON storage)
- Deduplication to prevent spam
- Slash commands for radar management (and more)
- Modular structure for easy expansion

---

## Requirements

- Node.js (v18+ recommended)
- A Nitrado DayZ server
- Discord bot token + webhook URLs

---

## Environment Variables (`.env`)

Create a `.env` file in the root with the following variables:

| Variable                        | Description                                      | Required? | Example / Notes                     |
|--------------------------------|--------------------------------------------------|-----------|-------------------------------------|
| `DISCORD_TOKEN`                | Your Discord bot token                           | Yes       | `MTA...`                           |
| `API_TOKEN`                    | Nitrado API token                                | Yes       | `eyJ...`                           |
| `SERVICE_ID`                   | Nitrado service / gameserver ID                  | Yes       | `12345678`                         |
| `KILLFEED_WEBHOOK_URL`         | Webhook for kill feed messages                   | Yes*      | `https://discord.com/api/webhooks/...` |
| `EVENTFEED_WEBHOOK_URL`        | Webhook for event notifications                  | Yes*      | `https://discord.com/api/webhooks/...` |
| `KILLFEED_INTERNAL_MS`         | Killfeed polling interval (ms)                   | No        | `30000` (default 30s)             |
| `SERVERSTATE_INTERNAL_MS`      | Server log polling interval (ms)                 | No        | `30000` (default 30s)             |
| `KILLFEED_DEBUG`               | Enable killfeed debug logs                       | No        | `true` / `false`                   |
| `EVENTFEED_DEBUG`              | Enable eventfeed debug logs                      | No        | `true` / `false`                   |
| `SERVERSTATE_DEBUG`            | Enable serverstate debug logs                    | No        | `true` / `false`                   |

_*At least one of the webhook URLs is required depending on which modules you want active._

---

## Installation & Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Hukmyster/Dayz-Event-Bot-2.0.git
   cd Dayz-Event-Bot-2.0
