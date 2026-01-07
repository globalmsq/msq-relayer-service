# Relay API

REST API service for submitting transactions to the queue system.

---

## Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│ Client       │────▶│ Relay API       │────▶│ AWS SQS      │
│              │     │ (Producer)      │     │ (LocalStack) │
└──────────────┘     └─────────────────┘     └──────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ MySQL (Prisma)  │
                     └─────────────────┘
```

- **Async Processing**: Returns 202 Accepted immediately, processes in background
- **SQS Producer**: Sends transaction messages to queue
- **MySQL Tracking**: Stores transaction metadata with `pending` status
- **API Key Authentication**: Secures API access

---

## API Endpoints

### Direct Transaction

**POST** `/api/v1/relay/direct`

Submit a direct transaction to the queue.

**Request**:
```json
{
  "to": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "data": "0x",
  "value": "0",
  "gas": "21000",
  "speed": "fast"
}
```

**Response** (202 Accepted):
```json
{
  "transactionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "createdAt": "2026-01-05T12:34:56.789Z"
}
```

### Gasless Transaction

**POST** `/api/v1/relay/gasless`

Submit a gasless meta-transaction (ERC-2771) to the queue.

**Request**:
```json
{
  "request": {
    "from": "0x...",
    "to": "0x...",
    "value": "0",
    "gas": "50000",
    "nonce": "0",
    "deadline": "1735123456",
    "data": "0x..."
  },
  "signature": "0x..."
}
```

**Response** (202 Accepted):
```json
{
  "transactionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "createdAt": "2026-01-05T12:34:56.789Z"
}
```

### Transaction Status

**GET** `/api/v1/relay/status/:transactionId`

Query transaction status.

**Response**:
```json
{
  "transactionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "hash": "0x1234...",
  "confirmedAt": "2026-01-05T12:35:10.123Z"
}
```

**Status Values**:
- `pending`: Queued for processing
- `success`: Successfully relayed to blockchain
- `failed`: Processing failed (check error message)

### Nonce Query

**GET** `/api/v1/relay/gasless/nonce/:address`

Get current nonce for gasless transactions.

**Response**:
```json
{
  "address": "0x...",
  "nonce": "0"
}
```

### Health Check

**GET** `/api/v1/health`

Check service health status.

**Response**:
```json
{
  "status": "ok",
  "info": {
    "sqs": { "status": "up" },
    "redis": { "status": "up" },
    "oz-relayer-pool": { "status": "up" }
  }
}
```

---

## Environment Variables

```bash
# API Configuration
PORT=8080
RELAY_API_KEY=your-api-key-here

# AWS SQS Configuration
AWS_REGION=ap-northeast-2
SQS_QUEUE_URL=http://localhost:4566/000000000000/relay-transactions
SQS_DLQ_URL=http://localhost:4566/000000000000/relay-transactions-dlq
SQS_ENDPOINT_URL=http://localhost:4566  # LocalStack only (omit for production)

# OZ Relayer
OZ_RELAYER_URL=http://localhost:8081
OZ_RELAYER_API_KEY=oz-relayer-api-key

# Forwarder Contract (ERC-2771)
FORWARDER_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
FORWARDER_NAME=MinimalForwarder
CHAIN_ID=80002  # Polygon Amoy Testnet

# Database
DATABASE_URL=mysql://root:password@localhost:3306/msq_relayer

# Redis (L1 Cache)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_TTL=300

# Webhook
WEBHOOK_SIGNING_KEY=webhook-secret-key
CLIENT_WEBHOOK_URL=http://localhost:3000/webhooks/transaction-updates
```

---

## Local Development

### 1. Start Infrastructure

```bash
docker compose -f docker-compose.yaml up -d localstack mysql redis
```

### 2. Run Database Migrations

```bash
pnpm --filter @msq-relayer/relay-api run prisma:migrate:dev
```

### 3. Start Development Server

```bash
pnpm --filter @msq-relayer/relay-api run start:dev
```

### 4. Test API

```bash
curl -X POST http://localhost:8080/api/v1/relay/direct \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "to": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "data": "0x"
  }'
```

---

## Testing

### Unit Tests

```bash
pnpm --filter @msq-relayer/relay-api test
```

### E2E Tests

```bash
pnpm --filter @msq-relayer/relay-api test:e2e
```

### Coverage Report

```bash
pnpm --filter @msq-relayer/relay-api test:cov
```

---

## Queue System (SPEC-QUEUE-001)

### Message Flow

1. **Client** → POST /api/v1/relay/direct
2. **Relay API** → Save to MySQL (`pending` status)
3. **Relay API** → Send message to SQS queue
4. **Relay API** → Return 202 Accepted with `transactionId`
5. **Queue Consumer** → Pick up message from SQS
6. **Queue Consumer** → Send to OZ Relayer
7. **Queue Consumer** → Update MySQL (`success` status)
8. **Queue Consumer** → Delete SQS message

### Dual Credentials Strategy

**Local Development** (LocalStack):
```bash
SQS_ENDPOINT_URL=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
```

**Production** (AWS):
```bash
# Omit SQS_ENDPOINT_URL
# Use IAM Instance Role (no access keys needed)
```

### Retry & DLQ

- **Max Retries**: 3 attempts
- **Visibility Timeout**: 60 seconds
- **DLQ**: Failed messages after 3 retries
- **Message Retention**: 4 days

---

## Production Deployment

### IAM Role Configuration

**ECS/EKS Deployment**:

```yaml
taskDefinition:
  taskRoleArn: arn:aws:iam::123456789012:role/relayApiTaskRole
  containerDefinitions:
    - name: relay-api
      environment:
        - name: SQS_QUEUE_URL
          value: https://sqs.ap-northeast-2.amazonaws.com/123456789012/relay-transactions
        # No SQS_ENDPOINT_URL = use real AWS SQS
```

**IAM Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:GetQueueUrl",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:ap-northeast-2:123456789012:relay-transactions"
    }
  ]
}
```

---

## Related Documentation

- [SPEC-QUEUE-001](../../.moai/specs/SPEC-QUEUE-001/spec.md) - Queue system specification
- [queue-consumer README](../queue-consumer/README.md) - Background worker
- [Docker Compose](../../docker-compose.yaml) - Infrastructure setup

---

## License

MIT
