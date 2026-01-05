import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { DirectController } from "./direct/direct.controller";
import { DirectService } from "./direct/direct.service";
import { GaslessModule } from "./gasless/gasless.module";
import { StatusModule } from "./status/status.module";
import { QueueModule } from "../queue/queue.module";

/**
 * RelayModule - NestJS module for relay/relayer functionality
 *
 * SPEC-PROXY-001: Direct Transaction API
 * SPEC-GASLESS-001: Gasless Transaction API
 * SPEC-STATUS-001: Transaction Status Polling API
 * SPEC-QUEUE-001: AWS SQS Queue System
 *
 * Registers:
 * - DirectController: POST /relay/direct endpoint
 * - DirectService: Business logic for direct transactions
 * - GaslessModule: Gasless transaction API endpoints
 * - StatusModule: Transaction status query API endpoints
 * - QueueModule: SQS queue producer for async transaction processing
 * - HttpModule: HTTP client for communication
 */
@Module({
  imports: [HttpModule, QueueModule, GaslessModule, StatusModule],
  controllers: [DirectController],
  providers: [DirectService],
})
export class RelayModule {}
