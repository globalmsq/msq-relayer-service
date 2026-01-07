# SQS/LocalStack Setup Guide

**Document Version**: 1.0.0
**Last Updated**: 2026-01-06
**Status**: Complete
**SPEC**: [SPEC-QUEUE-001](./../.moai/specs/SPEC-QUEUE-001/spec.md)

## Quick Start

```bash
# 1. Start LocalStack (includes SQS)
docker compose -f docker/docker-compose.yaml up -d localstack

# 2. Verify SQS queues were created
docker compose -f docker/docker-compose.yaml exec localstack awslocal sqs list-queues

# Expected output:
# {
#   "QueueUrls": [
#     "http://sqs.ap-northeast-2.localhost.localstack.cloud:4566/000000000000/relay-transactions",
#     "http://sqs.ap-northeast-2.localhost.localstack.cloud:4566/000000000000/relay-transactions-dlq"
#   ]
# }

# 3. Check queue attributes
docker compose -f docker/docker-compose.yaml exec localstack awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/relay-transactions \
  --attribute-names All
```

---

## LocalStack Configuration

### Docker Compose Setup

```yaml
# File: docker/docker-compose.yaml

services:
  localstack:
    image: localstack/localstack:3.0
    container_name: relayer-localstack
    ports:
      - "4566:4566"        # LocalStack main port
      - "8080:8080"        # Web UI
    environment:
      - SERVICES=sqs,dynamodb  # Enable SQS and DynamoDB
      - DOCKER_HOST=unix:///var/run/docker.sock
      - AWS_DEFAULT_REGION=ap-northeast-2
    volumes:
      - "./init:/docker-entrypoint-initaws.d"  # Init scripts
      - "localstack_data:/tmp/localstack"
    networks:
      - msq-relayer-network
    healthcheck:
      test: ["CMD", "awslocal", "sqs", "list-queues"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ... other services
```

### Queue Initialization

```bash
# File: docker/init/01-create-queues.sh

#!/bin/bash

echo "Creating SQS queues..."

# Create main queue
awslocal sqs create-queue \
  --queue-name relay-transactions \
  --attributes \
    VisibilityTimeout=60,\
    MessageRetentionPeriod=345600,\
    ReceiveMessageWaitTimeSeconds=20

# Create Dead Letter Queue
awslocal sqs create-queue \
  --queue-name relay-transactions-dlq

# Associate DLQ with main queue
QUEUE_URL=$(awslocal sqs get-queue-url --queue-name relay-transactions | jq -r '.QueueUrl')
DLQ_URL=$(awslocal sqs get-queue-url --queue-name relay-transactions-dlq | jq -r '.QueueUrl')
DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url $DLQ_URL --attribute-names QueueArn | jq -r '.Attributes.QueueArn')

awslocal sqs set-queue-attributes \
  --queue-url $QUEUE_URL \
  --attributes \
    RedrivePolicy="{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":3}"

echo "Queues created successfully"
awslocal sqs list-queues
```

### Queue Attributes Configuration

| Attribute | Value | Purpose |
|-----------|-------|---------|
| **VisibilityTimeout** | 60 seconds | Message hidden during processing |
| **MessageRetentionPeriod** | 345600 (4 days) | How long to keep messages |
| **ReceiveMessageWaitTimeSeconds** | 20 | Long-polling wait time |
| **MaxReceiveCount** | 3 | Retries before DLQ |

### Verify Queue Setup

```bash
# Check queue exists
docker compose exec localstack awslocal sqs list-queues

# Get queue attributes
docker compose exec localstack awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/relay-transactions \
  --attribute-names All

# Expected response:
# {
#   "Attributes": {
#     "QueueArn": "arn:aws:sqs:ap-northeast-2:000000000000:relay-transactions",
#     "VisibilityTimeout": "60",
#     "MessageRetentionPeriod": "345600",
#     "ReceiveMessageWaitTimeSeconds": "20",
#     "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:...\",\"maxReceiveCount\":3}"
#   }
# }

# Check queue is accessible
docker compose exec localstack awslocal sqs get-queue-url --queue-name relay-transactions
```

---

## Queue Management

### Send Test Message

```bash
# Send a test message to the queue
docker compose exec localstack awslocal sqs send-message \
  --queue-url http://localhost:4566/000000000000/relay-transactions \
  --message-body '{
    "transactionId": "test-123",
    "type": "direct",
    "request": {
      "to": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      "data": "0x"
    }
  }'

# Expected response:
# {
#   "MD5OfMessageBody": "...",
#   "MessageId": "...",
#   "ReceiptHandle": "..."
# }
```

### Receive Messages

```bash
# Receive messages from queue
docker compose exec localstack awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/relay-transactions \
  --max-number-of-messages 10 \
  --wait-time-seconds 20 \
  --visibility-timeout 60

# Expected response:
# {
#   "Messages": [
#     {
#       "MessageId": "...",
#       "ReceiptHandle": "...",
#       "MD5OfBody": "...",
#       "Body": "{...}",
#       "Attributes": {
#         "ApproximateReceiveCount": "1",
#         "SentTimestamp": "..."
#       }
#     }
#   ]
# }
```

### Delete Messages

```bash
# Delete a message (after successful processing)
docker compose exec localstack awslocal sqs delete-message \
  --queue-url http://localhost:4566/000000000000/relay-transactions \
  --receipt-handle "..."  # From receive-message response
```

### Check Queue Depth

```bash
# Get approximate number of messages in queue
docker compose exec localstack awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/relay-transactions \
  --attribute-names ApproximateNumberOfMessages

# Expected response:
# {
#   "Attributes": {
#     "ApproximateNumberOfMessages": "5"
#   }
# }
```

### Check DLQ Messages

```bash
# Receive messages from Dead Letter Queue
docker compose exec localstack awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/relay-transactions-dlq \
  --max-number-of-messages 10

# View messages that have failed 3 times
```

### Purge Queue (Testing Only)

```bash
# Clear all messages from queue (WARNING: Destructive)
docker compose exec localstack awslocal sqs purge-queue \
  --queue-url http://localhost:4566/000000000000/relay-transactions

# Verify queue is empty
docker compose exec localstack awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/relay-transactions \
  --attribute-names ApproximateNumberOfMessages
```

---

## LocalStack Web UI

### Access the Dashboard

Open your browser to: **http://localhost:4566**

The LocalStack Web UI provides:
- Visual queue browser
- Message inspection
- Queue depth monitoring
- Manual message sending
- Queue configuration viewer

### Features

1. **Queues View**
   - List all SQS queues
   - View queue attributes
   - Monitor queue depth
   - Inspect individual messages

2. **Message Inspection**
   - View message body
   - Check receipt count
   - See send/receive timestamps
   - Manual delete/resend

3. **Queue Configuration**
   - Edit queue attributes
   - Configure DLQ settings
   - Adjust visibility timeout
   - Set retention period

---

## Production AWS Configuration

### Queue Creation (AWS)

```bash
# Create main queue
aws sqs create-queue \
  --queue-name relay-transactions \
  --attributes \
    VisibilityTimeout=60,\
    MessageRetentionPeriod=345600,\
    ReceiveMessageWaitTimeSeconds=20 \
  --region ap-northeast-2

# Create Dead Letter Queue
aws sqs create-queue \
  --queue-name relay-transactions-dlq \
  --region ap-northeast-2

# Associate DLQ with main queue
QUEUE_URL=$(aws sqs get-queue-url --queue-name relay-transactions --region ap-northeast-2 | jq -r '.QueueUrl')
DLQ_URL=$(aws sqs get-queue-url --queue-name relay-transactions-dlq --region ap-northeast-2 | jq -r '.QueueUrl')
DLQ_ARN=$(aws sqs get-queue-attributes --queue-url $DLQ_URL --attribute-names QueueArn --region ap-northeast-2 | jq -r '.Attributes.QueueArn')

aws sqs set-queue-attributes \
  --queue-url $QUEUE_URL \
  --attributes \
    RedrivePolicy="{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":3}" \
  --region ap-northeast-2
```

### IAM Permissions

**ECS Task Role Policy**:

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
      "Resource": "arn:aws:sqs:ap-northeast-2:ACCOUNT-ID:relay-transactions"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:ChangeMessageVisibility"
      ],
      "Resource": [
        "arn:aws:sqs:ap-northeast-2:ACCOUNT-ID:relay-transactions",
        "arn:aws:sqs:ap-northeast-2:ACCOUNT-ID:relay-transactions-dlq"
      ]
    }
  ]
}
```

### Environment Variables

```bash
# Production (AWS)
AWS_REGION=ap-northeast-2
SQS_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/ACCOUNT-ID/relay-transactions
SQS_DLQ_URL=https://sqs.ap-northeast-2.amazonaws.com/ACCOUNT-ID/relay-transactions-dlq
# Omit SQS_ENDPOINT_URL to use real AWS
# Omit AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (use IAM role)
```

---

## Troubleshooting

### LocalStack Connection Issues

```bash
# Check LocalStack is running
docker compose -f docker/docker-compose.yaml ps

# View logs
docker compose -f docker/docker-compose.yaml logs localstack

# Test connectivity
curl http://localhost:4566

# Expected: 404 or some LocalStack response (not connection error)
```

### Queue Not Created

```bash
# Check if initialization script was executed
docker compose logs localstack | grep "Creating SQS"

# Manually create queue
docker compose exec localstack awslocal sqs create-queue --queue-name relay-transactions

# Verify creation
docker compose exec localstack awslocal sqs list-queues
```

### Messages Not Being Processed

```bash
# Check queue depth
docker compose exec localstack awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/relay-transactions \
  --attribute-names ApproximateNumberOfMessages

# Check consumer logs
docker compose logs queue-consumer

# Manually receive message to verify queue is accessible
docker compose exec localstack awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/relay-transactions
```

### DLQ Configuration Issues

```bash
# Verify DLQ is associated
docker compose exec localstack awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/relay-transactions \
  --attribute-names RedrivePolicy

# Expected: RedrivePolicy shows DLQ ARN and maxReceiveCount=3

# Check DLQ exists
docker compose exec localstack awslocal sqs list-queues | grep dlq
```

### Consumer Not Reading Messages

```bash
# 1. Verify queue URL is correct
echo $SQS_QUEUE_URL

# 2. Check queue is accessible from consumer
docker compose exec queue-consumer \
  curl http://localstack:4566/000000000000/relay-transactions

# 3. Check consumer environment variables
docker compose exec queue-consumer env | grep SQS

# 4. Verify consumer is running
docker compose logs queue-consumer
```

---

## Monitoring

### Queue Metrics

```bash
# Script to monitor queue depth
#!/bin/bash

while true; do
  DEPTH=$(docker compose exec localstack awslocal sqs get-queue-attributes \
    --queue-url http://localhost:4566/000000000000/relay-transactions \
    --attribute-names ApproximateNumberOfMessages | jq -r '.Attributes.ApproximateNumberOfMessages')

  echo "Queue Depth: $DEPTH messages"
  sleep 5
done
```

### Consumer Performance

```bash
# Check consumer logs for processing metrics
docker compose logs queue-consumer | grep -E "processing|success|failed"

# Expected output:
# Received 10 messages from queue
# Processing message: tx-123
# Transaction tx-123 completed successfully (1234ms)
```

### Message Flow

```bash
# 1. Send test message
docker compose exec localstack awslocal sqs send-message \
  --queue-url http://localhost:4566/000000000000/relay-transactions \
  --message-body '{"transactionId":"test-flow","type":"direct","request":{"to":"0x...","data":"0x"}}'

# 2. Monitor queue depth
docker compose exec localstack awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/relay-transactions \
  --attribute-names ApproximateNumberOfMessages

# 3. Watch consumer process message
docker compose logs -f queue-consumer

# 4. Verify in database
docker compose exec mysql mysql -u root -p \
  -e "SELECT id, status, hash FROM transactions WHERE id='test-flow';"

# Expected progression:
# Queue depth: 1 → 0 (message consumed)
# Consumer: "Processing message: test-flow"
# Database: status changes from 'pending' to 'success'
```

---

## Summary

SQS/LocalStack Setup provides:

- ✅ LocalStack containerized AWS emulation
- ✅ Automatic queue creation on startup
- ✅ Queue attribute configuration
- ✅ Web UI for queue monitoring
- ✅ Testing commands and scripts
- ✅ Production AWS configuration guide
- ✅ Troubleshooting guides
- ✅ Monitoring and observability tools

For complete technical specifications, see [SPEC-QUEUE-001](./../.moai/specs/SPEC-QUEUE-001/spec.md).
