import { Injectable, Logger } from "@nestjs/common";
import { QueueService } from "../../queue/queue.service";
import { DirectTxRequestDto } from "../dto/direct-tx-request.dto";
import { DirectTxResponseDto } from "../dto/direct-tx-response.dto";

/**
 * DirectService - Business logic for Direct Transaction API
 *
 * SPEC-PROXY-001: Direct Transaction API
 * SPEC-QUEUE-001: AWS SQS Queue System - Async Processing
 *
 * Handles transformation between API DTOs and queue service calls.
 * Transactions are queued for async processing by queue-consumer.
 */
@Injectable()
export class DirectService {
  private readonly logger = new Logger(DirectService.name);

  constructor(private readonly queueService: QueueService) {}

  /**
   * Queue a direct transaction for processing
   *
   * Flow:
   * 1. Receive and validate DirectTxRequestDto
   * 2. Call QueueService.sendDirectTransaction()
   * 3. Transaction is stored in DB with status="queued"
   * 4. Message is sent to SQS
   * 5. Return 202 Accepted with transactionId
   *
   * Consumer (queue-consumer) will:
   * - Poll message from SQS
   * - Call OZ Relayer
   * - Update transaction status
   *
   * @param dto - Validated DirectTxRequestDto from controller
   * @returns DirectTxResponseDto with transactionId and status="queued"
   * @throws ServiceUnavailableException if queue service unavailable
   */
  async sendTransaction(dto: DirectTxRequestDto): Promise<DirectTxResponseDto> {
    this.logger.log(`Queuing direct transaction: to=${dto.to}`);
    return this.queueService.sendDirectTransaction(dto);
  }
}
