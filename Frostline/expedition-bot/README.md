Expedition Bot

Setup

1. Copy `.env.example` to `.env` and fill in tokens and channel IDs.
2. Install dependencies:

```bash
cd "c:/Users/Arman/OneDrive/Frostline/expedition-bot"
npm install
```

3. Register commands (use a test guild during development):

```bash
npm run register-commands
```

4. Start the bot:

```bash
npm start
```

Notes
- Staff restrictions are basic: members with `Manage Guild` or a role named with 'staff' are allowed.
- Configure `ANNOUNCE_CHANNEL_ID`, `STAFF_CHANNEL_ID`, and `STAFF_LOG_CHANNEL_ID` in `.env`.
- The bot stores expedition data in `data/expeditions.db` (created automatically).
