# Queue System Architecture

**Document Version**: 1.0.0
**Last Updated**: 2026-01-06
**Status**: Complete
**SPEC**: [SPEC-QUEUE-001](./../.moai/specs/SPEC-QUEUE-001/spec.md)

## Table of Contents

1. [Overview](#overview)
2. [Architecture Layers](#architecture-layers)
3. [Message Flow](#message-flow)
4. [Component Responsibilities](#component-responsibilities)
5. [Data Models](#data-models)
6. [Resilience Patterns](#resilience-patterns)
7. [Deployment Topology](#deployment-topology)

---

## Overview

SPEC-QUEUE-001 transforms the MSQ Relayer from a synchronous request-response system to an asynchronous, scalable queue-based architecture using AWS SQS (with LocalStack for local development).

### Key Architectural Changes

**Before (Synchronous)**:
- Client sends transaction request → API waits for response → OZ Relayer processes synchronously
- Throughput limited by response time (~200ms)
- Tight coupling between API Gateway and OZ Relayer

**After (Asynchronous)**:
- Client sends transaction request → API returns 202 Accepted immediately
- Transaction queued in SQS for background processing
- Decoupled producer (relay-api) and consumer (queue-consumer)
- Independent scaling for API and background workers

### Architecture Principles

1. **Decoupling**: Producer and Consumer are independent services
2. **Resilience**: SQS provides built-in retry and dead letter queue mechanisms
3. **Scalability**: Horizontal scaling by adding consumer instances
4. **Observability**: Transaction status tracked at each stage
5. **Idempotency**: Duplicate message handling via transaction status checks

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                      │
│  Client Services (Payment, Airdrop, NFT, DeFi, Game)    │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│            API Gateway Layer (relay-api)                 │
│  • Authentication (X-API-Key)                           │
│  • Transaction validation                               │
│  • MySQL persistence (pending status)                   │
│  • SQS message publishing                               │
│  • 202 Accepted response                                │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│         Message Queue Layer (AWS SQS)                    │
│  • Queue: relay-transactions                            │
│  • DLQ: relay-transactions-dlq                          │
│  • Settings:                                            │
│    - Visibility Timeout: 60s                            │
│    - Message Retention: 4 days                          │
│    - Long-poll: 20s                                     │
│    - Max Receive Count: 3                               │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│     Consumer Layer (queue-consumer)                      │
│  • Long-poll SQS (20s wait)                             │
│  • Message deserialization                              │
│  • Idempotency check (MySQL)                            │
│  • Transaction processing                               │
│  • Result handling                                       │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│        Transaction Execution Layer                       │
│  • OZ Relayer (HTTP POST)                               │
│  • Blockchain submission                                │
│  • Status updates (MySQL + Redis)                       │
└─────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Component | Responsibility |
|-------|-----------|---|
| **API Gateway** | relay-api | Accept requests, store pending TX, publish to SQS |
| **Message Queue** | AWS SQS | Reliable message delivery, retry handling, DLQ |
| **Consumer** | queue-consumer | Long-poll SQS, orchestrate OZ Relayer calls |
| **Execution** | OZ Relayer | Sign and submit transactions to blockchain |
| **Storage** | MySQL + Redis | Transaction history and caching |

---

## Message Flow

### 1. Producer Flow (relay-api)

```
1. Client: POST /api/v1/relay/direct
   ├─ Payload: { to, data, value, gas, speed }

2. relay-api: Request Validation
   ├─ Schema validation (X-API-Key, request body)

3. relay-api: Database Write
   ├─ Create transaction record
   ├─ Status: "pending"
   ├─ Store: request payload, type (direct/gasless)

4. relay-api: SQS Publishing
   ├─ Create message:
   │  {
   │    "messageId": "UUID",
   │    "transactionId": "UUID",
   │    "type": "direct",
   │    "request": { ... },
   │    "timestamp": "ISO8601"
   │  }
   ├─ Send to relay-transactions queue

5. relay-api: Response
   ├─ HTTP 202 Accepted
   ├─ Body: { transactionId, status: "pending", createdAt }

6. Client: Polling/Webhook
   ├─ GET /api/v1/relay/status/{transactionId}
   ├─ Or wait for webhook notification
```

### 2. Queue Flow (AWS SQS)

```
1. Message Arrival
   ├─ Stored in relay-transactions queue
   ├─ Visibility Timeout: 60 seconds
   ├─ Retention: 4 days

2. Message Reception by Consumer
   ├─ Long-poll (20s wait time)
   ├─ Batch receive (up to 10 messages)
   ├─ Message becomes invisible to other consumers

3. Message Processing
   ├─ Consumer processes message
   ├─ If success: Delete message from queue
   ├─ If failure:
   │  ├─ DO NOT DELETE
   │  ├─ Message becomes visible again
   │  ├─ Retry count increments

4. Retry Handling
   ├─ ApproximateReceiveCount header tracks retries
   ├─ Max retries: 3
   ├─ After 3 failures: Move to DLQ

5. Dead Letter Queue (DLQ)
   ├─ Queue: relay-transactions-dlq
   ├─ Messages stuck after 3 retries
   ├─ Manual intervention required
```

### 3. Consumer Flow (queue-consumer)

```
1. Initialize Consumer
   ├─ Connect to SQS
   ├─ Connect to MySQL
   ├─ Connect to OZ Relayer
   ├─ Start long-polling loop

2. Receive Messages
   ├─ Long-poll SQS (20s)
   ├─ Receive batch (max 10)

3. Per-Message Processing
   ├─ Parse message
   ├─ Extract: transactionId, type, request

4. Idempotency Check
   ├─ Query MySQL: SELECT * FROM transactions WHERE id = ?
   ├─ If status = "success" or "failed": Skip (already processed)
   ├─ If status = "pending": Continue

5. OZ Relayer Call
   ├─ POST /api/v1/relay/{type}
   ├─ Headers: { "X-API-Key": "..." }
   ├─ Body: request payload
   ├─ Timeout: 30 seconds

6. Result Handling
   ├─ Success Response (200 OK):
   │  ├─ Extract: hash, transactionId
   │  ├─ Update MySQL: status = "success", result = { hash, ... }
   │  ├─ Update Redis: Cache result (TTL: 600s)
   │  ├─ Delete message from SQS
   │
   ├─ Failure Response (4xx/5xx):
   │  ├─ Log error
   │  ├─ Update MySQL: error_message = "..."
   │  ├─ DO NOT DELETE message (retry)
   │  ├─ If retry count = 3: Update status = "failed"
```

### 4. Status Query Flow

```
Client: GET /api/v1/relay/status/:transactionId

API Gateway: 3-Tier Lookup
├─ Tier 1: Redis (L1 Cache)
│  ├─ Key: "tx:{transactionId}"
│  ├─ If hit: Return cached result (~1-5ms)
│  ├─ If miss: Continue to Tier 2
│
├─ Tier 2: MySQL (L2 Storage)
│  ├─ SELECT * FROM transactions WHERE id = ?
│  ├─ If found: Backfill Redis cache, Return (~50ms)
│  ├─ If not found: Continue to Tier 3
│
├─ Tier 3: OZ Relayer (L3 External)
│  ├─ GET /api/v1/txs/{transactionId}
│  ├─ If found: Store in MySQL, Cache in Redis, Return (~200ms)
│  ├─ If not found: Return "Not Found" (404)

Response: 200 OK
{
  "transactionId": "UUID",
  "status": "success|pending|failed",
  "hash": "0x...",
  "confirmedAt": "ISO8601",
  "result": { ... },
  "error_message": null
}
```

---

## Component Responsibilities

### relay-api (Producer)

**Responsibilities**:
- Accept transaction requests from clients
- Validate request schema and authentication
- Store transaction record in MySQL with `pending` status
- Publish message to SQS queue
- Return 202 Accepted response immediately
- Provide status query endpoint (3-tier lookup)

**Key Modules**:
- `relay/direct.controller.ts` - Direct TX endpoint
- `relay/gasless.controller.ts` - Gasless TX endpoint
- `relay/status.controller.ts` - Status query endpoint
- `queue/queue.service.ts` - SQS publishing
- `prisma/prisma.service.ts` - MySQL persistence

### queue-consumer (Consumer)

**Responsibilities**:
- Connect to SQS queue
- Long-poll messages (20s wait time)
- Deserialize message payload
- Check transaction status (idempotency)
- Submit transaction to OZ Relayer
- Update transaction status in MySQL
- Handle failures and DLQ
- Graceful shutdown

**Key Modules**:
- `consumer.service.ts` - Main consumer logic
- `sqs/sqs.adapter.ts` - SQS client wrapper
- `relay/oz-relayer.client.ts` - OZ Relayer HTTP client
- `config/configuration.ts` - Environment configuration

### AWS SQS

**Responsibilities**:
- Store transaction messages durably
- Guarantee message delivery (at-least-once)
- Automatic retry via visibility timeout
- Dead Letter Queue for failed messages
- Message retention for audit trail

**Configuration**:
- Queue Name: `relay-transactions`
- DLQ Name: `relay-transactions-dlq`
- Visibility Timeout: 60 seconds
- Message Retention: 4 days
- Long-poll Wait Time: 20 seconds
- Max Receive Count: 3

---

## Data Models

### SQS Message Format

```json
{
  "messageId": "550e8400-e29b-41d4-a716-446655440000",
  "transactionId": "550e8400-e29b-41d4-a716-446655440001",
  "type": "direct|gasless",
  "request": {
    "to": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "data": "0x",
    "value": "0",
    "gas": "21000",
    "speed": "fast"
  },
  "timestamp": "2026-01-06T12:34:56.789Z"
}
```

### MySQL Transaction Record

```sql
CREATE TABLE transactions (
  id VARCHAR(36) PRIMARY KEY,
  type VARCHAR(20),                      -- 'direct' | 'gasless'
  status VARCHAR(20),                    -- 'pending' | 'success' | 'failed'
  request JSON,                          -- Original request payload
  result JSON,                           -- OZ Relayer response (hash, transactionId)
  error_message TEXT,                    -- Failure reason
  hash VARCHAR(66),                      -- Blockchain transaction hash
  createdAt DATETIME,
  confirmedAt DATETIME,
  updatedAt DATETIME,

  INDEX(status),
  INDEX(type),
  INDEX(createdAt)
);
```

### Redis Cache Format

```
Key: tx:{transactionId}
Value: {
  "transactionId": "UUID",
  "status": "success|pending|failed",
  "hash": "0x...",
  "confirmedAt": "ISO8601",
  "result": { ... }
}
TTL: 600 seconds (10 minutes)
```

---

## Resilience Patterns

### 1. Message Durability

**Pattern**: At-Least-Once Delivery

```
Message → SQS (Durable Storage)
       ├─ Consumer picks up message
       ├─ Visibility Timeout: 60s (Message hidden from others)
       ├─ Consumer processes
       └─ Consumer deletes message (or message expires)
```

**Implication**: Consumer MUST be idempotent

### 2. Idempotency

**Pattern**: Idempotent Message Processing

```
Message: { transactionId: "X", request: {...} }

Consumer:
1. Check MySQL: SELECT status FROM transactions WHERE id = "X"
2. If status = "success" or "failed":
   ├─ Already processed, skip processing
   └─ Delete message from SQS
3. If status = "pending":
   ├─ Process message
   └─ Update status
```

### 3. Retry Strategy

**Pattern**: Exponential Backoff via Visibility Timeout

```
Attempt 1: Visibility Timeout = 60s
           ├─ Processing fails
           └─ Message returned to queue

Attempt 2: Wait 60s, try again
           ├─ Processing fails
           └─ Message returned to queue

Attempt 3: Wait 60s, try again
           ├─ Processing fails
           └─ ApproximateReceiveCount = 3

Attempt 4: Message moved to DLQ
           ├─ No more automatic retries
           └─ Manual intervention required
```

### 4. Dead Letter Queue

**Pattern**: Failure Isolation

```
Message Processing Failures:
├─ Network error → Retry (automatic)
├─ OZ Relayer error → Retry (automatic)
├─ Invalid signature → DLQ (no retry)
└─ Invalid contract → DLQ (no retry)

DLQ Messages:
├─ Stored for audit
├─ Require manual investigation
└─ Can be replayed after fixing
```

### 5. Circuit Breaker (Optional)

**Pattern**: Prevent Cascading Failures

```
If OZ Relayer health checks fail repeatedly:
├─ Stop sending messages (circuit open)
├─ Log alerts to monitoring
├─ Wait for recovery
└─ Resume when health returns
```

---

## Deployment Topology

### Local Development (Docker)

```
┌─────────────────────────────────────────────────┐
│            Docker Compose (docker-compose.yaml)  │
│                                                  │
│ ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│ │ relay-api│  │queue-   │  │ localstack   │   │
│ │          │  │consumer │  │ (SQS, DynamoDB)   │
│ │:3000     │  │:depends │  │ :4566, :8080 │   │
│ └──────────┘  └──────────┘  └──────────────┘   │
│       │             │              │             │
│       └─────────────┼──────────────┘             │
│                     ▼                             │
│ ┌──────────────────────────────────────┐        │
│ │ MySQL  │ Redis  │ Hardhat (8545)    │        │
│ │ :3307  │ :6379  │ Blockchain        │        │
│ └──────────────────────────────────────┘        │
└─────────────────────────────────────────────────┘
```

### Production (AWS ECS/EKS)

```
┌───────────────────────────────────────────────────┐
│              AWS ECS/EKS Cluster                   │
│                                                    │
│ ┌─────────────────────────────────────────────┐   │
│ │          ECS Service (relay-api)             │   │
│ │  Desired Count: 2+                           │   │
│ │  Load Balancer (ALB)                         │   │
│ │  Auto-scaling: CPU/Memory based              │   │
│ └──────────┬──────────────────────────────────┘   │
│            │                                       │
│ ┌──────────▼──────────────────────────────────┐   │
│ │              AWS SQS Queue                   │   │
│ │  relay-transactions (Standard Queue)        │   │
│ │  relay-transactions-dlq (Dead Letter Queue) │   │
│ │  Visibility Timeout: 60s                    │   │
│ └──────────┬──────────────────────────────────┘   │
│            │                                       │
│ ┌──────────▼──────────────────────────────────┐   │
│ │      ECS Service (queue-consumer)            │   │
│ │  Desired Count: 2+                           │   │
│ │  Auto-scaling: Queue depth based             │   │
│ │  Graceful shutdown: 120s timeout             │   │
│ └──────────┬──────────────────────────────────┘   │
│            │                                       │
│ ┌──────────▼──────────────────────────────────┐   │
│ │         OZ Relayer (Private Subnet)          │   │
│ │  3x instances for HA and load distribution   │   │
│ └──────────┬──────────────────────────────────┘   │
│            │                                       │
│ ┌──────────▼──────────────────────────────────┐   │
│ │    AWS RDS (MySQL) + ElastiCache (Redis)    │   │
│ │  Multi-AZ for high availability              │   │
│ │  Automated backup and encryption             │   │
│ └──────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────┘
```

### Scaling Considerations

**relay-api (Producer)**:
- Scales based on request rate
- Lightweight operation (save to DB + SQS publish)
- Auto-scaling: 2-10 instances based on CPU/request count

**queue-consumer (Consumer)**:
- Scales based on queue depth
- Can process ~10-100 messages/sec per instance
- Auto-scaling: 1-20 instances based on SQS queue depth
- CloudWatch metric: ApproximateNumberOfMessagesVisible

**SQS Queue**:
- Unlimited throughput (AWS manages)
- Message retention: 4 days
- Cost: Pay per million requests

**OZ Relayer**:
- Fixed pool (3 instances for HA)
- Load balancing via Nginx
- Health checks every 30 seconds

---

## Monitoring & Observability

### Key Metrics

| Metric | Source | Alert Threshold |
|--------|--------|---|
| SQS Queue Depth | CloudWatch | > 1000 messages |
| Consumer Lag | CloudWatch | > 5 minutes |
| Message Processing Time | App Logs | > 10 seconds |
| DLQ Message Count | CloudWatch | > 10 messages |
| OZ Relayer Error Rate | App Logs | > 5% |
| Transaction Status - Pending | MySQL | > 1 hour |

### Logging Strategy

```
Consumer Log Format:
{
  "timestamp": "ISO8601",
  "level": "info|warn|error",
  "transactionId": "UUID",
  "messageId": "UUID",
  "action": "message_received|processing|success|failure",
  "duration_ms": 1234,
  "error": "error description (if any)",
  "oz_relayer_response": {...}
}
```

---

## Summary

SPEC-QUEUE-001 implements a robust, scalable async queue-based architecture that:

1. ✅ Decouples producer and consumer
2. ✅ Provides at-least-once message delivery
3. ✅ Ensures idempotent message processing
4. ✅ Enables independent scaling
5. ✅ Improves response time (202 vs 200 with hash)
6. ✅ Handles failures gracefully (DLQ)
7. ✅ Maintains audit trail (MySQL history)
8. ✅ Optimizes for local development (LocalStack)

See [SPEC-QUEUE-001](./../.moai/specs/SPEC-QUEUE-001/spec.md) for complete technical specifications.
