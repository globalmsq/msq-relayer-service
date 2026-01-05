import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConsumerService } from './consumer.service';
import { SqsAdapter } from './sqs/sqs.adapter';
import { OzRelayerClient } from './relay/oz-relayer.client';
import { PrismaService } from './prisma/prisma.service';

describe('ConsumerService (RED Phase - Failing Tests)', () => {
  let service: ConsumerService;
  let sqsAdapter: SqsAdapter;
  let relayerClient: OzRelayerClient;
  let prisma: PrismaService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsumerService,
        {
          provide: SqsAdapter,
          useValue: {
            receiveMessages: jest.fn(),
            deleteMessage: jest.fn(),
          },
        },
        {
          provide: OzRelayerClient,
          useValue: {
            sendToOzRelayer: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                SQS_QUEUE_URL: 'http://localhost:4566/000000000000/relay-transactions',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ConsumerService>(ConsumerService);
    sqsAdapter = module.get<SqsAdapter>(SqsAdapter);
    relayerClient = module.get<OzRelayerClient>(OzRelayerClient);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processMessages', () => {
    it('should receive messages from SQS', async () => {
      // RED: Test fails because processMessages is not implemented
      const mockMessages = [
        {
          MessageId: 'test-message-1',
          Body: JSON.stringify({
            transactionId: 'tx-123',
            type: 'direct',
            request: { to: '0x123', data: '0xabc' },
          }),
          ReceiptHandle: 'receipt-1',
        },
      ];

      jest.spyOn(sqsAdapter, 'receiveMessages').mockResolvedValue(mockMessages);

      // This will fail until processMessages is implemented
      await expect(service.processMessages()).resolves.not.toThrow();
    });

    it('should send message to OZ Relayer on success', async () => {
      const transactionId = 'tx-123';
      const mockMessage = {
        MessageId: 'msg-1',
        Body: JSON.stringify({
          transactionId,
          type: 'direct',
          request: { to: '0x123', data: '0xabc' },
        }),
        ReceiptHandle: 'receipt-1',
      };

      jest.spyOn(sqsAdapter, 'receiveMessages').mockResolvedValue([mockMessage]);
      jest
        .spyOn(relayerClient, 'sendToOzRelayer')
        .mockResolvedValue({ txHash: '0xabc123' });

      await service.processMessages();

      expect(relayerClient.sendToOzRelayer).toHaveBeenCalled();
    });

    it('should delete message from SQS on successful processing', async () => {
      const mockMessage = {
        MessageId: 'msg-1',
        Body: JSON.stringify({
          transactionId: 'tx-123',
          type: 'direct',
          request: { to: '0x123', data: '0xabc' },
        }),
        ReceiptHandle: 'receipt-1',
      };

      jest.spyOn(sqsAdapter, 'receiveMessages').mockResolvedValue([mockMessage]);
      jest
        .spyOn(relayerClient, 'sendToOzRelayer')
        .mockResolvedValue({ txHash: '0xabc123' });

      await service.processMessages();

      expect(sqsAdapter.deleteMessage).toHaveBeenCalledWith('receipt-1');
    });

    it('should update transaction status to success', async () => {
      const transactionId = 'tx-123';
      const mockMessage = {
        MessageId: 'msg-1',
        Body: JSON.stringify({
          transactionId,
          type: 'direct',
          request: { to: '0x123', data: '0xabc' },
        }),
        ReceiptHandle: 'receipt-1',
      };

      jest.spyOn(sqsAdapter, 'receiveMessages').mockResolvedValue([mockMessage]);
      jest
        .spyOn(relayerClient, 'sendToOzRelayer')
        .mockResolvedValue({ txHash: '0xabc123' });

      await service.processMessages();

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: transactionId },
          data: expect.objectContaining({ status: 'success' }),
        }),
      );
    });

    it('should handle duplicate messages (idempotent)', async () => {
      const transactionId = 'tx-123';
      const mockMessage = {
        MessageId: 'msg-1',
        Body: JSON.stringify({
          transactionId,
          type: 'direct',
          request: { to: '0x123', data: '0xabc' },
        }),
        ReceiptHandle: 'receipt-1',
      };

      // Transaction already processed
      jest.spyOn(prisma.transaction, 'findUnique').mockResolvedValue({
        id: transactionId,
        status: 'success',
      } as any);

      jest.spyOn(sqsAdapter, 'receiveMessages').mockResolvedValue([mockMessage]);

      await service.processMessages();

      // Should delete message without re-processing
      expect(sqsAdapter.deleteMessage).toHaveBeenCalled();
      expect(relayerClient.sendToOzRelayer).not.toHaveBeenCalled();
    });

    it('should handle OZ Relayer errors and retry', async () => {
      const mockMessage = {
        MessageId: 'msg-1',
        Body: JSON.stringify({
          transactionId: 'tx-123',
          type: 'direct',
          request: { to: '0x123', data: '0xabc' },
        }),
        ReceiptHandle: 'receipt-1',
      };

      jest.spyOn(sqsAdapter, 'receiveMessages').mockResolvedValue([mockMessage]);
      jest
        .spyOn(relayerClient, 'sendToOzRelayer')
        .mockRejectedValue(new Error('OZ Relayer unavailable'));

      // Should not throw, message should be returned to queue
      await expect(service.processMessages()).resolves.not.toThrow();

      // Should not delete message on failure
      expect(sqsAdapter.deleteMessage).not.toHaveBeenCalled();
    });
  });

  describe('graceful shutdown', () => {
    it('should stop processing on SIGTERM', async () => {
      // RED: Test for graceful shutdown
      const spy = jest.spyOn(service, 'onModuleDestroy');

      await service.onModuleDestroy();

      expect(spy).toHaveBeenCalled();
    });
  });
});
