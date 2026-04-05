# OpenAlice Chinese (Simplified) Translation Patch

This patch adds Chinese (Simplified) language support to the OpenAlice UI.

## Supported Pages

- **Dev Page** (`/dev`) - Developer tools with connectors, tools, and sessions tabs
- **Tools Page** (`/tools`) - Tool inventory with group labels and descriptions
- **Connectors Page** (`/connectors`) - Web UI, MCP Server, Telegram connector descriptions
- **Market Data Page** (`/market-data`) - Data providers, API keys, asset providers
- **Trading Page** (`/trading`) - Broker platforms (Alpaca, Longbridge, IBKR, CCXT), account credentials
- **News Page** (`/news`) - RSS feeds and article archive management
- **Heartbeat Page** (`/heartbeat`) - Periodic self-check configuration
- **Portfolio Page** (`/portfolio`) - Live portfolio overview
- **Events Page** (`/events`) - Event log and cron jobs
- **Settings Page** (`/settings`) - Agent settings and language preferences
- **AI Provider Page** (`/ai-provider`) - AI backend configuration
- **Chat Page** (`/chat`) - Channels and messaging

## Installation

### Option 1: Apply the patch directly

```bash
cd /path/to/OpenAlice
git apply openalice-i18n-chinese.patch
```

### Option 2: Manual installation

Copy the following files to your OpenAlice installation:

```bash
# Copy i18n translation files
cp -r ui/src/i18n/* /path/to/OpenAlice/ui/src/i18n/

# Copy modified pages
cp ui/src/pages/*.tsx /path/to/OpenAlice/ui/src/pages/

# Copy modified components
cp ui/src/components/SDKSelector.tsx /path/to/OpenAlice/ui/src/components/
cp ui/src/main.tsx /path/to/OpenAlice/ui/src/main.tsx
```

Then rebuild OpenAlice:

```bash
cd /path/to/OpenAlice
pnpm build
sudo systemctl restart openalice
```

## What's Included

### New Files

- `ui/src/i18n/en.ts` - English translations
- `ui/src/i18n/zh.ts` - Chinese (Simplified) translations
- `ui/src/i18n/index.tsx` - i18n provider and hook

### Modified Files

- `ui/src/pages/*.tsx` - All pages updated to use `useTranslation` hook
- `ui/src/components/SDKSelector.tsx` - Updated to support i18n for connector options
- `ui/src/main.tsx` - i18n provider integration

## Features

- **Full Chinese UI** - All user-facing text translated to Chinese (Simplified)
- **Dynamic translations** - Tool descriptions, broker fields, and provider descriptions translated
- **Language persistence** - Selected language saved to localStorage
- **Easy to extend** - Translation keys follow a consistent naming convention

## Translation Keys

Translation keys are organized by page/component:

| Section | Key Prefix | Description |
|---------|------------|-------------|
| Dev page | `dev.*` | Developer tools |
| Tools page | `tools.*` | Tool inventory |
| Connectors | `connectors.*` | Service integrations |
| Market Data | `marketData.*` | Financial data providers |
| Trading | `trading.*` | Broker accounts |
| News | `news.*` | RSS feeds |
| Heartbeat | `heartbeat.*` | Autonomous thinking |
| Portfolio | `portfolio.*` | Holdings overview |
| Events | `events.*` | Event log |
| AI Provider | `aiProvider.*` | AI backend |
| Settings | `settings.*` | Configuration |
| Chat | `chat.*` | Messaging |

## Adding New Translations

To add new translations:

1. Add the English key to `ui/src/i18n/en.ts`
2. Add the Chinese translation to `ui/src/i18n/zh.ts`
3. Use the translation in your component:

```tsx
const { t } = useTranslation()
// t.dev.title, t.tools.description, etc.
```

## License

Same as OpenAlice project.
