import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { OzRelayerModule } from "../oz-relayer/oz-relayer.module";
import { DirectController } from "./direct/direct.controller";
import { DirectService } from "./direct/direct.service";

/**
 * RelayModule - NestJS module for relay/relayer functionality
 *
 * SPEC-PROXY-001: Direct Transaction API
 * Registers:
 * - DirectController: POST /relay/direct endpoint
 * - DirectService: Business logic for direct transactions
 * - OzRelayerModule: Access to OZ Relayer service
 * - HttpModule: HTTP client for relayer communication
 */
@Module({
  imports: [HttpModule, OzRelayerModule],
  controllers: [DirectController],
  providers: [DirectService],
})
export class RelayModule {}
