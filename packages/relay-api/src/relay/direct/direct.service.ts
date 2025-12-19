import { Injectable } from "@nestjs/common";
import { OzRelayerService } from "../../oz-relayer/oz-relayer.service";
import { DirectTxRequestDto } from "../dto/direct-tx-request.dto";
import { DirectTxResponseDto } from "../dto/direct-tx-response.dto";

/**
 * DirectService - Business logic for Direct Transaction API
 *
 * SPEC-PROXY-001: Direct Transaction API
 * Handles transformation between API DTOs and OZ Relayer service calls
 */
@Injectable()
export class DirectService {
  constructor(private readonly ozRelayerService: OzRelayerService) {}

  /**
   * Send a direct transaction via OZ Relayer
   *
   * Flow:
   * 1. Receive and validate DirectTxRequestDto
   * 2. Call OzRelayerService.sendTransaction() (delegates to Nginx LB)
   * 3. Transform response to DirectTxResponseDto
   * 4. Return 202 Accepted status
   *
   * @param dto - Validated DirectTxRequestDto from controller
   * @returns DirectTxResponseDto with transaction details
   * @throws ServiceUnavailableException if OZ Relayer unavailable
   */
  async sendTransaction(dto: DirectTxRequestDto): Promise<DirectTxResponseDto> {
    const response = await this.ozRelayerService.sendTransaction({
      to: dto.to,
      data: dto.data,
      value: dto.value,
      gasLimit: dto.gasLimit,
      speed: dto.speed,
    });

    return {
      transactionId: response.transactionId,
      hash: response.hash,
      status: response.status,
      createdAt: response.createdAt,
    };
  }
}
