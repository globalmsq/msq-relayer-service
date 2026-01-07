# Queue Consumer

Background worker service for processing transaction messages from AWS SQS queue.

---

## Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│ AWS SQS      │────▶│ Queue Consumer  │────▶│ OZ Relayer   │
│ (LocalStack) │     │ (Long-polling)  │     │              │
└──────────────┘     └─────────────────┘     └──────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ MySQL (Prisma)  │
                     └─────────────────┘
```

- **SQS Long-polling**: 20 seconds wait time for efficient message retrieval
- **Idempotent Processing**: Prevents duplicate transaction processing
- **Retry Strategy**: 3 retries before moving to Dead Letter Queue (DLQ)
- **Graceful Shutdown**: Handles in-flight messages before termination

---

## Environment Variables

```bash
# AWS SQS Configuration
AWS_REGION=ap-northeast-2
SQS_QUEUE_URL=http://localhost:4566/000000000000/relay-transactions
SQS_DLQ_URL=http://localhost:4566/000000000000/relay-transactions-dlq
SQS_ENDPOINT_URL=http://localhost:4566  # LocalStack only (omit for production)

# SQS Settings
SQS_VISIBILITY_TIMEOUT=60
SQS_WAIT_TIME_SECONDS=20
SQS_MAX_RECEIVE_COUNT=3

# OZ Relayer
OZ_RELAYER_URL=http://localhost:8081
OZ_RELAYER_API_KEY=your-api-key

# Database
DATABASE_URL=mysql://root:password@localhost:3306/msq_relayer

# Redis (L1 Cache)
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Local Development

### 1. Start LocalStack

```bash
docker compose -f docker-compose.yaml up -d localstack
```

### 2. Verify SQS Queues Created

```bash
docker exec relayer-localstack-1 awslocal sqs list-queues
```

Expected output:
```json
{
    "QueueUrls": [
        "http://sqs.ap-northeast-2.localhost.localstack.cloud:4566/000000000000/relay-transactions",
        "http://sqs.ap-northeast-2.localhost.localstack.cloud:4566/000000000000/relay-transactions-dlq"
    ]
}
```

### 3. Run Consumer

```bash
pnpm --filter @msq-relayer/queue-consumer run start:dev
```

---

## Testing

### Unit Tests

```bash
pnpm --filter @msq-relayer/queue-consumer test
```

### Coverage Report

```bash
pnpm --filter @msq-relayer/queue-consumer test:cov
```

---

## Production Deployment

### IAM Role Configuration

For production deployment on AWS ECS/EKS, use IAM Instance Role instead of access keys:

```yaml
# ECS Task Definition
taskDefinition:
  executionRoleArn: arn:aws:iam::123456789012:role/ecsTaskExecutionRole
  taskRoleArn: arn:aws:iam::123456789012:role/queueConsumerTaskRole
  containerDefinitions:
    - name: queue-consumer
      environment:
        - name: AWS_REGION
          value: ap-northeast-2
        - name: SQS_QUEUE_URL
          value: https://sqs.ap-northeast-2.amazonaws.com/123456789012/relay-transactions
        # No SQS_ENDPOINT_URL = use real AWS SQS
```

**IAM Policy** (attach to taskRole):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": [
        "arn:aws:sqs:ap-northeast-2:123456789012:relay-transactions",
        "arn:aws:sqs:ap-northeast-2:123456789012:relay-transactions-dlq"
      ]
    }
  ]
}
```

---

## Message Processing Flow

1. **Long-poll SQS** (20s wait time)
2. **Receive message** with transaction data
3. **Check idempotency** via MySQL transaction status
4. **Send to OZ Relayer** via HTTP POST
5. **Update MySQL** transaction status to `success`
6. **Delete SQS message** (successful processing)

### Retry Flow

1. **OZ Relayer failure** → Do NOT delete message
2. **SQS visibility timeout** → Message becomes visible again
3. **Retry** up to 3 times (maxReceiveCount=3)
4. **DLQ move** → After 3 failures, message moves to DLQ
5. **MySQL update** → Transaction status set to `failed`

---

## Health Monitoring

Consumer reports health status via health check endpoint (if configured in NestJS).

**Key Metrics**:
- Messages processed per second
- Average processing time
- DLQ message count
- Error rate

---

## Related Documentation

- [SPEC-QUEUE-001](../../.moai/specs/SPEC-QUEUE-001/spec.md) - Full specification
- [relay-api README](../relay-api/README.md) - Producer service
- [Docker Compose](../../docker-compose.yaml) - Infrastructure setup

---

## License

MIT
