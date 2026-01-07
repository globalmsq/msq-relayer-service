import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
  MessageSystemAttributeName,
} from '@aws-sdk/client-sqs';

@Injectable()
export class SqsAdapter {
  private readonly logger = new Logger(SqsAdapter.name);
  private client!: SQSClient;

  constructor(private configService: ConfigService) {
    this.initializeClient();
  }

  private initializeClient() {
    const endpoint = this.configService.get<string>('sqs.endpoint');
    const region = this.configService.get<string>('sqs.region');
    const isLocal = !!endpoint;

    this.logger.log(`Initializing SQS Client (${isLocal ? 'LocalStack' : 'AWS'})`);

    this.client = new SQSClient(
      isLocal
        ? {
            endpoint,
            region,
            credentials: {
              accessKeyId: this.configService.get('sqs.accessKeyId') || 'test',
              secretAccessKey: this.configService.get('sqs.secretAccessKey') || 'test',
            },
          }
        : {
            region,
            // Production: IAM Instance Role credentials auto-loaded
          },
    );
  }

  async receiveMessages(
    waitTimeSeconds: number = 20,
    maxNumberOfMessages: number = 10,
  ): Promise<Message[]> {
    const queueUrl = this.configService.get<string>('sqs.queueUrl');

    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxNumberOfMessages,
        WaitTimeSeconds: waitTimeSeconds,
        MessageSystemAttributeNames: [
          MessageSystemAttributeName.ApproximateReceiveCount,
          MessageSystemAttributeName.SentTimestamp,
        ],
      });

      const response = await this.client.send(command);
      return response.Messages || [];
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to receive messages: ${err.message}`, err.stack);
      throw error;
    }
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    const queueUrl = this.configService.get<string>('sqs.queueUrl');

    try {
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await this.client.send(command);
      this.logger.debug(`Message deleted: ${receiptHandle}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to delete message: ${err.message}`, err.stack);
      throw error;
    }
  }
}
