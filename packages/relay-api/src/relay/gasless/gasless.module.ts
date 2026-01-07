import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { GaslessController } from "./gasless.controller";
import { GaslessService } from "./gasless.service";
import { SignatureVerifierService } from "./signature-verifier.service";
import { QueueModule } from "../../queue/queue.module";

/**
 * GaslessModule - Gasless Transaction API module
 *
 * SPEC-GASLESS-001: Gasless Transaction API
 * SPEC-QUEUE-001: AWS SQS Queue System - Async Processing
 *
 * Provides gasless meta-transaction functionality via ERC2771Forwarder.
 * Transactions are validated synchronously (signature, nonce, deadline)
 * then queued for async processing via SQS.
 *
 * Module exports:
 * - GaslessController: REST endpoints
 * - GaslessService: Pre-validation and queue orchestration
 * - SignatureVerifierService: EIP-712 signature verification
 *
 * Dependencies:
 * - HttpModule: For JSON-RPC calls to Forwarder contract (nonce query)
 * - QueueModule: SQS queue producer for async transaction processing
 */
@Module({
  imports: [HttpModule, QueueModule],
  controllers: [GaslessController],
  providers: [GaslessService, SignatureVerifierService],
  exports: [GaslessService, SignatureVerifierService],
})
export class GaslessModule {}
