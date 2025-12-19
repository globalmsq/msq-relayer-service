import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { HealthCheckError } from "@nestjs/terminus";
import { of, throwError } from "rxjs";
import { OzRelayerHealthIndicator } from "./oz-relayer.health";

/**
 * OzRelayerHealthIndicator Tests - Simplified for Nginx LB health check
 *
 * SPEC-PROXY-001: Nginx Load Balancer-based OZ Relayer Proxy
 * Tests verify:
 * - Single health check to Nginx LB
 * - Timeout handling (5 seconds)
 * - Error propagation
 * - Response time measurement
 * - Environment variable configuration
 */
describe("OzRelayerHealthIndicator", () => {
  let indicator: OzRelayerHealthIndicator;
  let httpService: HttpService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OzRelayerHealthIndicator,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === "OZ_RELAYER_URL") {
                return defaultValue || "http://oz-relayer-lb:8080";
              }
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    indicator = module.get<OzRelayerHealthIndicator>(OzRelayerHealthIndicator);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe("isHealthy", () => {
    it("should return healthy when Nginx LB responds with 200", async () => {
      jest.spyOn(httpService, "get").mockReturnValueOnce(
        of({
          status: 200,
          data: "healthy",
        } as any),
      );

      const result = await indicator.isHealthy("oz-relayer-lb");

      expect(result).toBeDefined();
      expect(result["oz-relayer-lb"].status).toBe("up");
      expect(httpService.get).toHaveBeenCalledWith(
        "http://oz-relayer-lb:8080/health",
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it("should throw HealthCheckError when Nginx LB is unreachable", async () => {
      jest
        .spyOn(httpService, "get")
        .mockReturnValueOnce(
          throwError(() => new Error("Connection refused")) as any,
        );

      await expect(indicator.isHealthy("oz-relayer-lb")).rejects.toThrow(
        HealthCheckError,
      );
    });

    it("should throw HealthCheckError on timeout", async () => {
      jest
        .spyOn(httpService, "get")
        .mockReturnValueOnce(
          throwError(() => new Error("Timeout after 5000ms")) as any,
        );

      await expect(indicator.isHealthy("oz-relayer-lb")).rejects.toThrow(
        HealthCheckError,
      );
    });

    it("should include response time in health status", async () => {
      jest.spyOn(httpService, "get").mockReturnValueOnce(
        of({
          status: 200,
          data: "healthy",
        } as any),
      );

      const result = await indicator.isHealthy("oz-relayer-lb");

      expect(result["oz-relayer-lb"]).toHaveProperty("responseTime");
      expect(typeof result["oz-relayer-lb"].responseTime).toBe("number");
      expect(result["oz-relayer-lb"].responseTime).toBeGreaterThanOrEqual(0);
    });

    it("should use configured OZ_RELAYER_URL environment variable", async () => {
      jest
        .spyOn(configService, "get")
        .mockReturnValueOnce("http://custom-lb:8080");

      const newIndicator = new OzRelayerHealthIndicator(
        httpService,
        configService,
      );

      jest.spyOn(httpService, "get").mockReturnValueOnce(
        of({
          status: 200,
          data: "healthy",
        } as any),
      );

      await newIndicator.isHealthy("oz-relayer-lb");

      expect(httpService.get).toHaveBeenCalledWith(
        "http://custom-lb:8080/health",
        expect.any(Object),
      );
    });

    it("should include error details in HealthCheckError when LB is down", async () => {
      const errorMessage = "ECONNREFUSED: connection refused";
      jest
        .spyOn(httpService, "get")
        .mockReturnValueOnce(throwError(() => new Error(errorMessage)) as any);

      try {
        await indicator.isHealthy("oz-relayer-lb");
        fail("Should have thrown HealthCheckError");
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
        expect(error.causes["oz-relayer-lb"].error).toContain("ECONNREFUSED");
      }
    });

    it("should only make single health check call to Nginx LB", async () => {
      const getSpy = jest.spyOn(httpService, "get").mockReturnValueOnce(
        of({
          status: 200,
          data: "healthy",
        } as any),
      );

      await indicator.isHealthy("oz-relayer-lb");

      // Only 1 call to Nginx LB (not 3 calls to individual relayers)
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    it("should check /health endpoint on Nginx LB", async () => {
      const getSpy = jest.spyOn(httpService, "get").mockReturnValueOnce(
        of({
          status: 200,
          data: "healthy",
        } as any),
      );

      await indicator.isHealthy("oz-relayer-lb");

      expect(getSpy).toHaveBeenCalledWith(
        expect.stringContaining("/health"),
        expect.any(Object),
      );
    });
  });

  describe("Integration", () => {
    it("should be injectable as a provider", () => {
      expect(indicator).toBeDefined();
      expect(indicator).toBeInstanceOf(OzRelayerHealthIndicator);
    });

    it("should inherit from HealthIndicator", () => {
      expect(indicator).toHaveProperty("getStatus");
    });
  });
});
