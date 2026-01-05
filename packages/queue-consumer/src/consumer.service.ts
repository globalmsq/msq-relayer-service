import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SqsAdapter } from './sqs/sqs.adapter';
import { OzRelayerClient } from './relay/oz-relayer.client';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class ConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsumerService.name);
  private isShuttingDown = false;
  private processingTimeout: NodeJS.Timeout | null = null;

  constructor(
    private sqsAdapter: SqsAdapter,
    private relayerClient: OzRelayerClient,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.logger.log('Consumer Service initialized');
    this.startProcessing();
  }

  async onModuleDestroy() {
    this.logger.log('Received shutdown signal, stopping message processing...');
    this.isShuttingDown = true;

    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
    }

    // Wait for in-flight messages to complete (max 30 seconds)
    await this.waitForInFlightMessages(30000);
    this.logger.log('Consumer gracefully shut down');
  }

  private async waitForInFlightMessages(timeout: number): Promise<void> {
    // Placeholder: In full implementation, track in-flight messages
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private startProcessing() {
    if (!this.isShuttingDown) {
      this.processMessages().catch((error: unknown) => {
        const err = error as Error;
        this.logger.error(`Error in message processing: ${err.message}`, err.stack);
      });

      // Schedule next processing cycle after waiting
      this.processingTimeout = setTimeout(
        () => this.startProcessing(),
        1000,
      );
    }
  }

  async processMessages(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    try {
      const config = this.configService.get('consumer');
      const messages = await this.sqsAdapter.receiveMessages(
        config.waitTimeSeconds,
        config.maxNumberOfMessages,
      );

      if (!messages || messages.length === 0) {
        return;
      }

      for (const message of messages) {
        if (this.isShuttingDown) {
          this.logger.warn('Shutdown requested, stopping message processing');
          break;
        }

        await this.handleMessage(message);
      }
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Message processing error: ${err.message}`, err.stack);
    }
  }

  private async handleMessage(message: any): Promise<void> {
    const { MessageId, Body, ReceiptHandle } = message;

    try {
      const messageBody = JSON.parse(Body);
      const { transactionId, type, request } = messageBody;

      this.logger.log(`Processing message: ${transactionId} (${type})`);

      // Check if transaction already processed (idempotent)
      const transaction = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
      });

      if (transaction && ['success', 'failed'].includes(transaction.status)) {
        this.logger.log(
          `Transaction already in terminal state: ${transaction.status}, deleting message`,
        );
        await this.sqsAdapter.deleteMessage(ReceiptHandle);
        return;
      }

      // Send to OZ Relayer
      const result = await this.relayerClient.sendToOzRelayer(request);

      // Update transaction status to success
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'success',
          result,
        },
      });

      // Delete message from SQS
      await this.sqsAdapter.deleteMessage(ReceiptHandle);

      this.logger.log(`Message processed successfully: ${transactionId}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to process message ${MessageId}: ${err.message}`,
        err.stack,
      );

      // Message will be automatically returned to queue due to visibility timeout
      // SQS will retry up to maxReceiveCount times before moving to DLQ
    }
  }
}
