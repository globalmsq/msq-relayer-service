import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

/**
 * Direct Transaction Request Interface
 * Represents a blockchain transaction to be relayed
 */
export interface DirectTxRequest {
  to: string;
  data: string;
  value?: string;
  gasLimit?: string;
  speed?: string;
}

/**
 * Direct Transaction Response Interface
 * Response from OZ Relayer after transaction submission
 */
export interface DirectTxResponse {
  transactionId: string;
  hash: string;
  status: string;
  createdAt: string;
}

/**
 * OzRelayerService - Simplified to use single Nginx Load Balancer endpoint
 * Delegates load balancing, health checking, and failover to Nginx
 *
 * SPEC-PROXY-001: Nginx Load Balancer-based OZ Relayer Proxy
 * - Removed: Custom pool management logic (~50 LOC)
 * - Removed: Relayer endpoints array (3 instances)
 * - Added: Single relayerUrl from environment variable
 * - Result: 60% code reduction
 */
@Injectable()
export class OzRelayerService {
  private readonly relayerUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // Single Nginx LB endpoint (or external LB in production)
    this.relayerUrl = this.configService.get<string>(
      "OZ_RELAYER_URL",
      "http://oz-relayer-lb:8080",
    );
  }

  /**
   * Send transaction to OZ Relayer via Nginx Load Balancer
   * Nginx handles distribution to healthy relayers
   *
   * @param request - DirectTxRequest with transaction details
   * @returns DirectTxResponse with transaction ID, hash, and status
   * @throws ServiceUnavailableException if OZ Relayer is unavailable
   */
  async sendTransaction(request: DirectTxRequest): Promise<DirectTxResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<DirectTxResponse>(
          `${this.relayerUrl}/api/v1/transactions`,
          request,
          {
            headers: {
              "Content-Type": "application/json",
            },
            timeout: 30000, // 30 seconds
          },
        ),
      );
      return response.data;
    } catch (error) {
      throw new ServiceUnavailableException("OZ Relayer service unavailable");
    }
  }

  /**
   * Query transaction status via Nginx Load Balancer
   *
   * @param txId - Transaction ID to query
   * @returns Transaction status and details
   * @throws ServiceUnavailableException if OZ Relayer is unavailable
   */
  async getTransactionStatus(txId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.relayerUrl}/api/v1/transactions/${txId}`, {
          timeout: 10000,
        }),
      );
      return response.data;
    } catch (error) {
      throw new ServiceUnavailableException("OZ Relayer service unavailable");
    }
  }
}
