import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { SignatureVerifierService } from "./signature-verifier.service";
import { QueueService } from "../../queue/queue.service";
import { GaslessTxRequestDto } from "../dto/gasless-tx-request.dto";
import { GaslessTxResponseDto } from "../dto/gasless-tx-response.dto";

/**
 * GaslessService - Gasless Transaction Orchestration
 *
 * SPEC-GASLESS-001: Gasless Transaction API
 * SPEC-QUEUE-001: AWS SQS Queue System - Async Processing
 *
 * Pre-validation (fail-fast before queuing):
 * - U-GASLESS-001: EIP-712 Signature Verification
 * - U-GASLESS-002: Deadline Validation
 * - T-GASLESS-005: Nonce Query and Validation
 *
 * After validation, transaction is queued for async processing.
 * Consumer (queue-consumer) handles:
 * - U-GASLESS-004: Forwarder Transaction Build
 * - OZ Relayer submission
 * - Status updates
 */
@Injectable()
export class GaslessService {
  private readonly logger = new Logger(GaslessService.name);

  constructor(
    private readonly signatureVerifier: SignatureVerifierService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Validate and queue gasless transaction for processing
   *
   * Complete workflow:
   * 1. Validate deadline is in the future
   * 2. Query expected nonce from Forwarder contract
   * 3. Validate request.nonce matches expected nonce (pre-check)
   * 4. Verify EIP-712 signature
   * 5. Queue transaction for async processing
   * 6. Return 202 Accepted with transactionId
   *
   * Consumer (queue-consumer) will:
   * - Build Forwarder.execute() transaction
   * - Call OZ Relayer
   * - Update transaction status
   *
   * @param dto - Validated GaslessTxRequestDto
   * @returns GaslessTxResponseDto with transactionId and status="queued"
   * @throws BadRequestException if deadline expired or nonce mismatch
   * @throws UnauthorizedException if signature invalid
   * @throws ServiceUnavailableException if RPC or queue service unavailable
   */
  async sendGaslessTransaction(
    dto: GaslessTxRequestDto,
  ): Promise<GaslessTxResponseDto> {
    // Step 1: Validate deadline is in the future
    if (!this.signatureVerifier.validateDeadline(dto.request.deadline)) {
      throw new BadRequestException("Transaction deadline expired");
    }

    // Step 2: Query expected nonce from Forwarder contract
    const expectedNonce = await this.getNonceFromForwarder(dto.request.from);

    // Step 3: Validate request.nonce matches expected nonce (Layer 1: relay-api pre-check)
    this.validateNonceMatch(dto.request.nonce, expectedNonce);

    // Step 4: Verify EIP-712 signature
    const isSignatureValid = this.signatureVerifier.verifySignature(
      dto.request,
      dto.signature,
    );

    if (!isSignatureValid) {
      throw new UnauthorizedException("Invalid EIP-712 signature");
    }

    // Step 5: Queue transaction for async processing
    const forwarderAddress =
      this.configService.get<string>("FORWARDER_ADDRESS");

    if (!forwarderAddress) {
      throw new Error("FORWARDER_ADDRESS not configured");
    }

    this.logger.log(
      `Queuing gasless transaction: from=${dto.request.from}, forwarder=${forwarderAddress}`,
    );

    // Step 6: Return 202 Accepted with transactionId
    return this.queueService.sendGaslessTransaction(dto, forwarderAddress);
  }

  /**
   * Query nonce value from ERC2771Forwarder contract
   *
   * Uses JSON-RPC eth_call to read current nonce for address
   * This is a query-only operation - relay-api does NOT manage nonces
   * The Forwarder contract automatically increments nonce after transaction executes
   *
   * @param address - Ethereum address to query nonce for
   * @returns Current nonce value as string
   * @throws ServiceUnavailableException if RPC call fails
   */
  async getNonceFromForwarder(address: string): Promise<string> {
    try {
      const rpcUrl = this.configService.get<string>("RPC_URL");
      const forwarderAddress =
        this.configService.get<string>("FORWARDER_ADDRESS");

      if (!rpcUrl || !forwarderAddress) {
        throw new Error("RPC_URL or FORWARDER_ADDRESS not configured");
      }

      // Build eth_call request to nonces(address)
      // nonces function selector: 0x7ecebe00 (first 4 bytes of keccak256("nonces(address)"))
      const noncesFunctionSelector = "0x7ecebe00";
      const paddedAddress = address
        .toLowerCase()
        .replace("0x", "")
        .padStart(64, "0");
      const callData = noncesFunctionSelector + paddedAddress;

      // Make JSON-RPC call
      const response = await this.httpService.axiosRef.post(rpcUrl, {
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: forwarderAddress,
            data: callData,
          },
          "latest",
        ],
        id: 1,
      });

      // Parse response (32-byte return value)
      if (response.data.result) {
        // Convert hex result to decimal string
        const nonce = BigInt(response.data.result).toString();
        return nonce;
      }

      throw new Error("No result from eth_call");
    } catch (error) {
      this.logger.error(
        `Failed to query nonce for address ${address}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw new ServiceUnavailableException(
        "Failed to query nonce from Forwarder contract",
      );
    }
  }

  /**
   * Validate that request nonce matches expected nonce
   * This is Layer 1 pre-check validation in relay-api
   *
   * Layer 1 (relay-api): Pre-check optimization - validates immediately
   * Layer 2 (Contract): Final security - ERC2771Forwarder validates on-chain
   *
   * @param requestNonce - Nonce provided in request
   * @param expectedNonce - Current nonce from Forwarder contract
   * @throws BadRequestException if nonce mismatch with detailed error message
   */
  private validateNonceMatch(
    requestNonce: string,
    expectedNonce: string,
  ): void {
    if (requestNonce !== expectedNonce) {
      throw new BadRequestException(
        `Invalid nonce: expected ${expectedNonce}, got ${requestNonce}`,
      );
    }
  }
}
