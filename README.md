# Myrmidons Strategies Vault Interface

A modern, user-friendly web interface for interacting with Myrmidons Strategies ERC-4626 vaults on Morpho (HyperEVM).

## Overview

Myrmidons Strategies designs and curates ERC-4626 vaults that allocate across selected Morpho markets on HyperEVM (Hyperliquid). This interface provides a seamless way to deposit, withdraw, and monitor your vault positions with full transparency.

**Built on**: Morpho's open-source [earn-basic-app](https://github.com/morpho-org/earn-basic-app)

## Features

- **🔐 Non-custodial** - Your assets remain in your wallet and audited smart contracts
- **🌉 Cross-chain deposits** - Bridge and deposit from any supported chain via LiFi integration
- **📊 Real-time metrics** - Live TVL, APY, share price, and performance fee tracking
- **🎯 Allocation transparency** - View detailed breakdown of vault positions across Morpho markets
- **🌐 Multi-language** - English and French translations
- **📱 Mobile-optimized** - Responsive design with mobile-first approach
- **⚡ Performance-focused** - Skeleton states, optimistic updates, and efficient data fetching

## Tech Stack

### Core
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS 4** - Styling

### Web3
- **Wagmi 2** - React hooks for Ethereum
- **Viem 2** - Ethereum utilities
- **RainbowKit** - Wallet connection UI
- **Ethers.js 6** - Contract interactions

### Morpho
- **@morpho-org/blue-sdk** - Morpho protocol SDK
- **@morpho-org/blue-api-sdk** - API integration
- **@morpho-org/simulation-sdk** - Transaction simulation

### Data & State
- **Apollo Client** - GraphQL client for Morpho API
- **TanStack Query** - Server state management
- **SWR** - Data fetching and caching

### Features
- **LiFi SDK** - Cross-chain bridging and swapping
- **i18next** - Internationalization
- **Recharts** - Data visualization
- **React Router** - Client-side routing

## Getting Started

### Prerequisites

- Node.js 18+ and npm 11+
- A Web3 wallet (e.g., MetaMask, Rabby)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd earn-basic-app

# Install dependencies
npm install
```

### Development

```bash
# Start the development server
npm run dev

# The app will be available at http://localhost:5173
```

### Build

```bash
# Build for production
npm run build

# Preview the production build
npm run preview
```

### Linting

```bash
# Run ESLint
npm run lint
```

### GraphQL Code Generation

```bash
# Generate TypeScript types from GraphQL queries
npm run codegen
```

## Project Structure

```
src/
├── components/          # React components
│   ├── landing/        # Landing page components
│   ├── layout/         # Layout components (header, footer)
│   ├── wallet/         # Wallet connection components
│   └── ui/             # Reusable UI components
├── hooks/              # Custom React hooks
├── lib/                # Utility libraries
├── i18n/               # Translation files
├── graphql/            # GraphQL queries and generated types
├── pages/              # Page components
├── service/            # API services
├── utils/              # Helper functions
├── chains/             # Chain configurations
├── constants/          # App constants
└── viem/               # Viem clients and config
```

## Key Components

### Pages
- **Landing Page** - Vault overview and value propositions
- **Vault Info** - Detailed vault metrics, allocations, deposit/withdraw
- **About** - Project information, strategy, FAQ, and risks

### Shared Components
- `InnerPageHero` - Reusable hero section with badges
- `MetricCard` - Standardized metric display with tooltips
- `CopyableAddress` - Address display with copy and explorer link
- `AllocationPieChart` - Visual allocation breakdown
- `GroupedAllocationList` - Detailed allocation table

## Configuration

### Vault Configuration
Edit `src/config/vaults.config.ts` to configure vault parameters:
- Vault address
- Supported chains
- Display name and description
- Asset information

### Chain Configuration
HyperEVM chain configuration is in `src/chains/hyperEVM.ts`.

### Environment Variables
Create a `.env` file for any required environment variables (API keys, RPC URLs, etc.).

## Internationalization

Translations are managed in `src/i18n/`:
- `en.json` - English
- `fr.json` - French

To add a new language:
1. Create a new JSON file (e.g., `es.json`)
2. Add the language to `src/i18n/index.ts`
3. Copy keys from `en.json` and translate

## Design System

### Colors
- `--bg`: #FFFFF5 (Creamy background)
- `--heading`: #00295B (Obsidian Navy)
- `--text`: #101720 (Midnight Blue)
- `--accent-brass`: #B08D57 (Brass accents)

### Typography
- Headings: Title Case, Obsidian Navy
- Body: Sentence case, Midnight Blue
- Font: System font stack

### Spacing
- Base scale: 8px increments
- Hero padding: 40-48px vertical
- Card padding: 20-24px

## Performance

- **Skeleton states** for all async content
- **Optimistic updates** for deposit/withdraw
- **Efficient data fetching** with SWR and TanStack Query
- **Code splitting** via React Router
- **Asset optimization** for images

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security

This is a non-custodial interface. Your private keys never leave your wallet. All transactions are signed locally.

**Smart Contract Risks**: Interacting with DeFi protocols involves smart contract risk. The Morpho vaults use audited contracts, but users should do their own research.

## License

MIT License - see LICENSE file for details

## Links

- **Morpho Protocol**: [morpho.org](https://morpho.org/)
- **HyperEVM Explorer**: [hyperevmscan.io](https://hyperevmscan.io/)
- **LiFi Bridge**: [jumper.exchange](https://jumper.exchange/)

## Support

For questions or issues:
- Email: contact@myrmidons-strategies.com
- Check the About page in the app for more information

---

**Disclaimer**: This interface is provided as-is. DeFi involves risks including smart contract risk, market risk, and liquidation risk. Users are responsible for understanding these risks before depositing funds.
