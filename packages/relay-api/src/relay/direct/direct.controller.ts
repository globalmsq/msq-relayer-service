import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { DirectService } from "./direct.service";
import { DirectTxRequestDto } from "../dto/direct-tx-request.dto";
import { DirectTxResponseDto } from "../dto/direct-tx-response.dto";

/**
 * DirectController - REST API endpoints for Direct Transaction API
 *
 * SPEC-PROXY-001: Direct Transaction API
 * - U-PROXY-006: System shall implement Direct Transaction API under `/api/v1/relay/direct` endpoint
 * - U-PROXY-008: System shall return HTTP 202 Accepted for successful Direct Transaction submissions
 */
@ApiTags("Direct Transaction")
@Controller("relay/direct")
export class DirectController {
  constructor(private readonly directService: DirectService) {}

  /**
   * Submit a direct transaction to the OZ Relayer Pool
   *
   * Workflow:
   * 1. Receive POST request with DirectTxRequestDto
   * 2. NestJS automatically validates DTO (class-validator)
   * 3. Call directService.sendTransaction()
   * 4. Return 202 Accepted with DirectTxResponseDto
   * 5. Nginx LB distributes request to healthy relayer
   *
   * HTTP Status:
   * - 202 Accepted: Transaction accepted for processing
   * - 400 Bad Request: Invalid request data
   * - 401 Unauthorized: Missing API Key
   * - 503 Service Unavailable: OZ Relayer pool down
   *
   * @param dto - Validated DirectTxRequestDto containing transaction details
   * @returns DirectTxResponseDto with transaction ID, hash, and status
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Send direct transaction via OZ Relayer",
    description:
      "Submit a direct blockchain transaction to the OZ Relayer Pool via Nginx Load Balancer",
  })
  @ApiResponse({
    status: 202,
    type: DirectTxResponseDto,
    description: "Transaction accepted for processing",
  })
  @ApiResponse({
    status: 400,
    description: "Invalid request data (invalid address, missing fields, etc.)",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized (missing or invalid API Key)",
  })
  @ApiResponse({
    status: 503,
    description: "Service Unavailable (OZ Relayer pool down)",
  })
  async sendDirectTransaction(
    @Body() dto: DirectTxRequestDto,
  ): Promise<DirectTxResponseDto> {
    return this.directService.sendTransaction(dto);
  }
}
