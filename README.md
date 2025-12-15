# MSQ Relayer Service

**Blockchain Transaction Relayer System** - B2B Infrastructure

A self-hosted blockchain transaction relay system in preparation for OpenZeppelin Defender service discontinuation (July 2026).

## Quick Start

```bash
# Local development environment (Hardhat Node)
docker compose -f docker/docker-compose.yaml up -d

# Polygon Amoy Testnet
docker compose -f docker/docker-compose-amoy.yaml up -d

# Health Check
curl http://localhost:3000/api/v1/health
```

## Documentation

For detailed documentation, see the [docs/](./docs/) directory:

| Document | Role | Question Type |
|----------|------|---------------|
| [product.md](./docs/product.md) | **WHAT/WHY** | "What are we building?", "Why is it needed?" |
| [structure.md](./docs/structure.md) | **WHERE** | "Where is it located?", "How is it organized?" |
| [tech.md](./docs/tech.md) | **HOW** | "How do we implement it?", "What are the API specs?" |

## Project Structure

```
msq-relayer-service/
├── docker/                     # Docker files consolidated directory
├── packages/
│   ├── api-gateway/            # NestJS API Gateway
│   ├── contracts/              # Smart Contracts (Hardhat)
│   └── examples/               # Usage examples
├── docs/                       # Documentation
└── README.md
```

## Status

**Phase 1 Implementation** (Direct + Gasless + Multi-Relayer Pool)

---

**Version**: 12.0
**Last Updated**: 2025-12-15
