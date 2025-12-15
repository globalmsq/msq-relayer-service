# MSQ Relayer Service - Suggested Commands

## Development Environment Setup

### Docker Commands
```bash
# Start all services
docker compose up -d

# Start specific services
docker compose up -d oz-relayer redis mysql

# View logs
docker compose logs -f oz-relayer
docker compose logs -f api-gateway

# Stop all services
docker compose down

# Rebuild and start
docker compose up -d --build
```

### API Gateway (NestJS)
```bash
# Navigate to API Gateway
cd packages/api-gateway

# Install dependencies
npm install

# Development mode
npm run start:dev

# Build
npm run build

# Production
npm run start:prod

# Run tests
npm run test
npm run test:e2e
npm run test:cov

# Linting
npm run lint
npm run format
```

### Smart Contracts (Hardhat)
```bash
# Navigate to contracts
cd packages/contracts

# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Deploy to local
npx hardhat run scripts/deploy-forwarder.ts --network hardhat

# Deploy to testnet
npx hardhat run scripts/deploy-forwarder.ts --network amoy
npx hardhat run scripts/deploy-forwarder.ts --network sepolia

# Deploy to mainnet
npx hardhat run scripts/deploy-forwarder.ts --network polygon
```

### Database (Prisma)
```bash
cd packages/api-gateway

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Database studio
npx prisma studio

# Reset database
npx prisma migrate reset
```

### Client SDK
```bash
cd packages/sdk

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm run test
```

## System Commands (macOS/Darwin)
```bash
# List files
ls -la

# Find files
find . -name "*.ts" -type f

# Search in files
grep -r "pattern" --include="*.ts"

# Git status
git status
git branch

# Process management
lsof -i :3000    # Check port usage
kill -9 <PID>    # Kill process
```

## Project-Specific Commands
```bash
# Check OZ Relayer health
curl http://localhost:8080/health

# Check API Gateway health
curl http://localhost:3000/api/v1/health

# Check Redis
redis-cli ping
```
