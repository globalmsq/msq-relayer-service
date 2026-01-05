export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  database: {
    url: process.env.DATABASE_URL || 'mysql://root:pass@localhost:3307/msq_relayer',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  sqs: {
    endpoint: process.env.SQS_ENDPOINT_URL,
    queueUrl: process.env.SQS_QUEUE_URL || 'http://localhost:4566/000000000000/relay-transactions',
    dlqUrl: process.env.SQS_DLQ_URL || 'http://localhost:4566/000000000000/relay-transactions-dlq',
    region: process.env.AWS_REGION || 'ap-northeast-2',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  relayer: {
    url: process.env.OZ_RELAYER_URL || 'http://localhost:8081',
    apiKey: process.env.OZ_RELAYER_API_KEY || 'oz-relayer-shared-api-key-local-dev',
  },

  consumer: {
    maxNumberOfMessages: 10,
    waitTimeSeconds: 20,
    visibilityTimeout: 60,
    maxReceiveCount: 3,
  },
});
