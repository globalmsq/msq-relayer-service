import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { firstValueFrom } from "rxjs";

/**
 * OzRelayerHealthIndicator - Simplified to check Nginx Load Balancer health
 *
 * SPEC-PROXY-001: Nginx Load Balancer-based OZ Relayer Proxy
 * - Removed: relayerEndpoints array (3 instances)
 * - Removed: checkSingleRelayer() method
 * - Removed: aggregateStatus() method
 * - Added: Single relayerUrl from environment variable
 * - Updated: isHealthy() checks Nginx LB /health endpoint only
 * - Result: 80+ LOC reduction (~70%)
 *
 * E-PROXY-005: When Health Check endpoint is called, the system shall verify Nginx LB status
 * - Single health check to Nginx LB (which handles pool health internally)
 * - Nginx automatically excludes unhealthy relayers from distribution
 */
@Injectable()
export class OzRelayerHealthIndicator extends HealthIndicator {
  private readonly relayerUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    super();
    // Single Nginx LB endpoint (same as OzRelayerService)
    this.relayerUrl = this.configService.get<string>(
      "OZ_RELAYER_URL",
      "http://oz-relayer-lb:8080",
    );
  }

  /**
   * Check OZ Relayer Load Balancer health
   * Nginx LB handles underlying pool health automatically
   *
   * The health endpoint checks if Nginx is running. If Nginx is up, it means:
   * - At least one healthy relayer is available (Nginx wouldn't route otherwise)
   * - Nginx is actively health-checking the pool
   * - Automatic failover is enabled
   *
   * @param key - Health indicator key (e.g., 'oz-relayer-lb')
   * @returns HealthIndicatorResult with Nginx LB status
   * @throws HealthCheckError if Nginx LB is unavailable
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startTime = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.relayerUrl}/health`, {
          timeout: 5000,
        }),
      );

      if (response.status === 200) {
        return this.getStatus(key, true, {
          url: this.relayerUrl,
          responseTime: Date.now() - startTime,
        });
      }

      // Handle non-200 responses
      return this.getStatus(key, false, {
        url: this.relayerUrl,
        responseTime: Date.now() - startTime,
        error: `HTTP ${response.status}`,
      });
    } catch (error) {
      throw new HealthCheckError(
        "OZ Relayer LB health check failed",
        this.getStatus(key, false, {
          url: this.relayerUrl,
          responseTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }
}
