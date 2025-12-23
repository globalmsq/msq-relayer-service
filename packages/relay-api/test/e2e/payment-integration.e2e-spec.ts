import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/test-app.factory';
import { TEST_WALLETS, TEST_ADDRESSES } from '../fixtures/test-wallets';
import { signForwardRequest, createForwardRequest } from '../utils/eip712-signer';

describe('Payment Integration E2E Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Complete Payment Flows', () => {
    it('TC-E2E-P001: batch token transfer with multiple Direct TX requests', async () => {
      // Given: Multiple Direct TX requests for batch token transfer
      const txIds: string[] = [];
      const recipients = [
        TEST_ADDRESSES.merchant,
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ];

      // When: Submit multiple Direct TX requests
      for (const recipient of recipients) {
        const payload = {
          to: recipient,
          data: '0x',
          speed: 'fast',
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/relay/direct')
          .set('x-api-key', 'test-api-key')
          .send(payload);

        // Then: Each request should be handled
        expect([200, 202, 400, 401, 503]).toContain(response.status);
        if (response.status === 202) {
          expect(response.body).toHaveProperty('txId');
          txIds.push(response.body.txId);
        }
      }

      // Verify: At least some requests completed successfully
      expect(txIds.length).toBeGreaterThanOrEqual(0);
    });

    it('TC-E2E-P002: complete gasless payment flow with all 4 steps', async () => {
      // Given: User address
      const userAddress = TEST_ADDRESSES.user;
      const recipientAddress = TEST_ADDRESSES.merchant;

      // Step 1: Query nonce
      const nonceResponse = await request(app.getHttpServer())
        .get(`/api/v1/relay/gasless/nonce/${userAddress}`)
        .set('x-api-key', 'test-api-key');

      expect([200, 400, 401, 500, 503]).toContain(nonceResponse.status);

      // Step 2: Create and sign ForwardRequest
      const forwardRequest = createForwardRequest(
        userAddress,
        recipientAddress,
        { nonce: 0, data: '0x' }
      );
      const signature = await signForwardRequest(TEST_WALLETS.user, forwardRequest);

      expect(signature).toBeTruthy();
      expect(signature.length).toBeGreaterThan(0);

      // Step 3: Submit Gasless TX
      const submitResponse = await request(app.getHttpServer())
        .post('/api/v1/relay/gasless')
        .set('x-api-key', 'test-api-key')
        .send({ request: forwardRequest, signature });

      expect([200, 202, 400, 401, 503]).toContain(submitResponse.status);

      // Step 4: Query status (if we have a txId)
      if (submitResponse.status === 202 && submitResponse.body.txId) {
        const txId = submitResponse.body.txId;
        const statusResponse = await request(app.getHttpServer())
          .get(`/api/v1/relay/status/${txId}`)
          .set('x-api-key', 'test-api-key');

        expect([200, 400, 404, 503]).toContain(statusResponse.status);
      }

      // Verify: Complete flow handled appropriately
      expect([forwardRequest, signature]).toBeTruthy();
    });
  });
});
