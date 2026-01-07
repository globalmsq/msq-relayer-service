import { Injectable, Logger } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { ConfigService } from "@nestjs/config";
import { SQSClient, GetQueueAttributesCommand } from "@aws-sdk/client-sqs";

/**
 * SQS Health Indicator
 *
 * SPEC-QUEUE-001: AWS SQS Queue System - Health Check
 *
 * Checks SQS queue connectivity by querying queue attributes.
 * Returns approximate message count for monitoring.
 */
@Injectable()
export class SqsHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(SqsHealthIndicator.name);
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(private readonly configService: ConfigService) {
    super();

    const endpoint = this.configService.get<string>("sqs.endpoint");
    const region = this.configService.get<string>("sqs.region");

    // Initialize SQS client with dual credential support
    this.client = new SQSClient(
      endpoint
        ? {
            endpoint,
            region,
            credentials: {
              accessKeyId:
                this.configService.get<string>("sqs.accessKeyId") || "test",
              secretAccessKey:
                this.configService.get<string>("sqs.secretAccessKey") || "test",
            },
          }
        : {
            region,
            // Production: IAM Instance Role credentials auto-loaded
          },
    );

    this.queueUrl = this.configService.get<string>("sqs.queueUrl") || "";
  }

  /**
   * Check SQS health by querying queue attributes
   *
   * @param key - Health indicator key (e.g., 'sqs')
   * @returns HealthIndicatorResult with queue status and message count
   * @throws HealthCheckError when SQS is not reachable
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const command = new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: [
          "ApproximateNumberOfMessages",
          "ApproximateNumberOfMessagesNotVisible",
        ],
      });

      const response = await this.client.send(command);

      const messagesInQueue =
        response.Attributes?.ApproximateNumberOfMessages || "0";
      const messagesInFlight =
        response.Attributes?.ApproximateNumberOfMessagesNotVisible || "0";

      return this.getStatus(key, true, {
        status: "up",
        messagesInQueue: parseInt(messagesInQueue, 10),
        messagesInFlight: parseInt(messagesInFlight, 10),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`SQS health check failed: ${errorMessage}`);

      throw new HealthCheckError(
        `SQS health check failed: ${errorMessage}`,
        this.getStatus(key, false, { status: "down" }),
      );
    }
  }
}
