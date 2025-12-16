# MSQ Relayer Contracts

Smart contracts for MSQ Relayer Service.

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your private key and API keys
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile contracts |
| `npm test` | Run tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run node` | Start local Hardhat node |
| `npm run deploy:local` | Deploy to localhost |
| `npm run deploy:amoy` | Deploy to Polygon Amoy |
| `npm run verify` | Verify contract on Polygonscan |
| `npm run clean` | Clean artifacts |

## Networks

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Hardhat | 31337 | In-memory |
| Localhost | 31337 | http://localhost:8545 |
| Polygon Amoy | 80002 | https://rpc-amoy.polygon.technology |

## Project Structure

```
contracts/     # Solidity source files
scripts/       # Deployment scripts
test/          # Test files
artifacts/     # Compiled contracts (generated)
typechain-types/ # TypeScript types (generated)
```

## Development Workflow

1. Write contracts in `contracts/`
2. Write tests in `test/`
3. Run tests: `npm test`
4. Deploy locally: `npm run node` + `npm run deploy:local`
5. Deploy to testnet: `npm run deploy:amoy`
6. Verify: `npm run verify <contract-address>`

## Docker Integration

This package is used by the `hardhat-node` Docker service in `docker/docker-compose.yaml`.

```yaml
hardhat-node:
  build:
    context: ..
    dockerfile: docker/Dockerfile.packages
    target: hardhat-node
```
