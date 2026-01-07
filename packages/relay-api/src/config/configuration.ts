/**
 * Application Configuration
 *
 * SPEC-QUEUE-001: AWS SQS Queue System - Producer Configuration
 *
 * SQS configuration requires explicit environment variables (fail-fast):
 * - SQS_QUEUE_URL: Required - SQS queue URL
 * - SQS_DLQ_URL: Required - Dead letter queue URL
 * - AWS_REGION: Required - AWS region
 * - SQS_ENDPOINT_URL: Optional - LocalStack endpoint (omit for production)
 * - AWS_ACCESS_KEY_ID: Optional - Uses IAM Role in production
 * - AWS_SECRET_ACCESS_KEY: Optional - Uses IAM Role in production
 */
export default () => ({
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  apiKey: process.env.RELAY_API_KEY,
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
  rpc: {
    url: process.env.RPC_URL || "http://localhost:8545",
  },
  sqs: {
    endpoint: process.env.SQS_ENDPOINT_URL, // undefined in production (uses AWS default)
    queueUrl: process.env.SQS_QUEUE_URL, // REQUIRED - no default
    dlqUrl: process.env.SQS_DLQ_URL, // REQUIRED - no default
    region: process.env.AWS_REGION, // REQUIRED - no default
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, // optional (IAM Role in production)
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // optional (IAM Role in production)
  },
});
