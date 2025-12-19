import { Test, TestingModule } from "@nestjs/testing";
import { DirectService } from "./direct.service";
import {
  OzRelayerService,
  DirectTxResponse,
} from "../../oz-relayer/oz-relayer.service";
import { DirectTxRequestDto } from "../dto/direct-tx-request.dto";

describe("DirectService", () => {
  let service: DirectService;
  let ozRelayerService: OzRelayerService;

  const mockDirectTxResponse: DirectTxResponse = {
    transactionId: "tx_abc123def456",
    hash: "0xabc123def456789abc123def456789abc123def456789abc123def456789abc1",
    status: "pending",
    createdAt: "2025-12-19T10:30:00.000Z",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DirectService,
        {
          provide: OzRelayerService,
          useValue: {
            sendTransaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DirectService>(DirectService);
    ozRelayerService = module.get<OzRelayerService>(OzRelayerService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("sendTransaction", () => {
    it("should send transaction and return response", async () => {
      const requestDto: DirectTxRequestDto = {
        to: "0x1234567890123456789012345678901234567890",
        data: "0xabcdef",
        value: "1000000000000000000",
        gasLimit: "21000",
        speed: "fast",
      };

      jest
        .spyOn(ozRelayerService, "sendTransaction")
        .mockResolvedValueOnce(mockDirectTxResponse);

      const result = await service.sendTransaction(requestDto);

      expect(result).toEqual(mockDirectTxResponse);
      expect(ozRelayerService.sendTransaction).toHaveBeenCalledWith({
        to: requestDto.to,
        data: requestDto.data,
        value: requestDto.value,
        gasLimit: requestDto.gasLimit,
        speed: requestDto.speed,
      });
    });

    it("should handle missing optional fields", async () => {
      const requestDto: DirectTxRequestDto = {
        to: "0x1234567890123456789012345678901234567890",
        data: "0xabcdef",
      };

      jest
        .spyOn(ozRelayerService, "sendTransaction")
        .mockResolvedValueOnce(mockDirectTxResponse);

      const result = await service.sendTransaction(requestDto);

      expect(result).toEqual(mockDirectTxResponse);
      expect(ozRelayerService.sendTransaction).toHaveBeenCalledWith({
        to: requestDto.to,
        data: requestDto.data,
        value: undefined,
        gasLimit: undefined,
        speed: undefined,
      });
    });

    it("should propagate OzRelayerService errors", async () => {
      const requestDto: DirectTxRequestDto = {
        to: "0x1234567890123456789012345678901234567890",
        data: "0xabcdef",
      };

      const error = new Error("OZ Relayer service unavailable");
      jest
        .spyOn(ozRelayerService, "sendTransaction")
        .mockRejectedValueOnce(error);

      await expect(service.sendTransaction(requestDto)).rejects.toThrow(error);
    });
  });
});
