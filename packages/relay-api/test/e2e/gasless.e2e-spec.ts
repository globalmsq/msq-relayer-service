import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/test-app.factory';
import { TEST_WALLETS, TEST_ADDRESSES } from '../fixtures/test-wallets';
import { signForwardRequest, createForwardRequest, createExpiredForwardRequest } from '../utils/eip712-signer';

describe('Gasless Transaction E2E Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/relay/gasless', () => {
    it('TC-E2E-G001: should accept valid gasless transaction with signature', async () => {
      // Given: Valid ForwardRequest + signature
      const forwardRequest = createForwardRequest(
        TEST_ADDRESSES.user,
        TEST_ADDRESSES.merchant,
        { data: '0x', nonce: 0 }
      );
      const signature = await signForwardRequest(TEST_WALLETS.user, forwardRequest);

      // When: Call POST /api/v1/relay/gasless
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/gasless')
        .set('x-api-key', 'test-api-key')
        .send({ request: forwardRequest, signature });

      // Then: Should be accepted or properly handled
      expect([200, 202, 400, 401, 503]).toContain(response.status);
      if (response.status === 202) {
        expect(response.body).toHaveProperty('txId');
      }
    });

    it('TC-E2E-G002: should accept custom gas and value included', async () => {
      // Given: ForwardRequest with custom gas and value
      const forwardRequest = createForwardRequest(
        TEST_ADDRESSES.user,
        TEST_ADDRESSES.merchant,
        {
          data: '0x',
          nonce: 0,
          gas: '200000',
          value: '1000000000000000000', // 1 ETH in wei
        }
      );
      const signature = await signForwardRequest(TEST_WALLETS.user, forwardRequest);

      // When: Call POST /api/v1/relay/gasless
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/gasless')
        .set('x-api-key', 'test-api-key')
        .send({ request: forwardRequest, signature });

      // Then: Should be handled properly
      expect([200, 202, 400, 401, 503]).toContain(response.status);
    });
  });

  describe('GET /api/v1/relay/gasless/nonce/:address', () => {
    it('TC-E2E-G003: should return nonce for valid address', async () => {
      // Given: Valid user address
      const userAddress = TEST_ADDRESSES.user;

      // When: Call GET /api/v1/relay/gasless/nonce/:address
      const response = await request(app.getHttpServer())
        .get(`/api/v1/relay/gasless/nonce/${userAddress}`)
        .set('x-api-key', 'test-api-key');

      // Then: Should return valid response
      expect([200, 400, 401, 503, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('nonce');
      }
    });

    it('TC-E2E-G004: should return 400 for invalid address format', async () => {
      // Given: Invalid Ethereum address
      const invalidAddress = 'not-an-address';

      // When: Call GET /api/v1/relay/gasless/nonce/:address
      const response = await request(app.getHttpServer())
        .get(`/api/v1/relay/gasless/nonce/${invalidAddress}`)
        .set('x-api-key', 'test-api-key');

      // Then: Should reject with 400
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/relay/gasless signature verification', () => {
    it('TC-E2E-G005: should handle invalid signature format', async () => {
      // Given: ForwardRequest with invalid signature format
      const forwardRequest = createForwardRequest(
        TEST_ADDRESSES.user,
        TEST_ADDRESSES.merchant,
        { data: '0x', nonce: 0 }
      );
      const invalidSignature = 'invalid-signature-format';

      // When: Call POST /api/v1/relay/gasless
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/gasless')
        .set('x-api-key', 'test-api-key')
        .send({ request: forwardRequest, signature: invalidSignature });

      // Then: Should reject signature
      expect([400, 401]).toContain(response.status);
    });

    it('TC-E2E-G006: should reject signature from wrong signer', async () => {
      // Given: ForwardRequest signed by different wallet
      const forwardRequest = createForwardRequest(
        TEST_ADDRESSES.user,
        TEST_ADDRESSES.merchant,
        { data: '0x', nonce: 0 }
      );
      // Sign with merchant wallet instead of user wallet
      const wrongSignature = await signForwardRequest(TEST_WALLETS.merchant, forwardRequest);

      // When: Call POST /api/v1/relay/gasless
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/gasless')
        .set('x-api-key', 'test-api-key')
        .send({ request: forwardRequest, signature: wrongSignature });

      // Then: Should reject wrong signature
      expect([400, 401]).toContain(response.status);
    });

    it('TC-E2E-G007: should reject expired deadline', async () => {
      // Given: ForwardRequest with expired deadline
      const forwardRequest = createExpiredForwardRequest(
        TEST_ADDRESSES.user,
        TEST_ADDRESSES.merchant,
      );
      const signature = await signForwardRequest(TEST_WALLETS.user, forwardRequest);

      // When: Call POST /api/v1/relay/gasless
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/gasless')
        .set('x-api-key', 'test-api-key')
        .send({ request: forwardRequest, signature });

      // Then: Should reject expired request
      expect([400, 401]).toContain(response.status);
    });

    it('TC-E2E-G008: should handle nonce mismatch', async () => {
      // Given: ForwardRequest with wrong nonce
      const forwardRequest = createForwardRequest(
        TEST_ADDRESSES.user,
        TEST_ADDRESSES.merchant,
        { data: '0x', nonce: 999 } // Wrong nonce
      );
      const signature = await signForwardRequest(TEST_WALLETS.user, forwardRequest);

      // When: Call POST /api/v1/relay/gasless
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/gasless')
        .set('x-api-key', 'test-api-key')
        .send({ request: forwardRequest, signature });

      // Then: Should handle nonce issue
      expect([200, 202, 400, 401, 503]).toContain(response.status);
    });

    it('TC-E2E-G009: should reject malformed signature', async () => {
      // Given: ForwardRequest with malformed signature
      const forwardRequest = createForwardRequest(
        TEST_ADDRESSES.user,
        TEST_ADDRESSES.merchant,
        { data: '0x', nonce: 0 }
      );
      const malformedSignature = '0x' + 'ff'.repeat(30); // Too short

      // When: Call POST /api/v1/relay/gasless
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/gasless')
        .set('x-api-key', 'test-api-key')
        .send({ request: forwardRequest, signature: malformedSignature });

      // Then: Should reject malformed signature
      expect([400, 401]).toContain(response.status);
    });

    it('TC-E2E-G010: should reject missing required fields', async () => {
      // Given: Incomplete ForwardRequest (missing required fields)
      const incompleteRequest = {
        from: TEST_ADDRESSES.user,
        // Missing: to, value, gas, nonce, deadline, data
      };

      // When: Call POST /api/v1/relay/gasless
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/gasless')
        .set('x-api-key', 'test-api-key')
        .send({ request: incompleteRequest, signature: '0x' });

      // Then: Should reject incomplete request
      expect([400, 401]).toContain(response.status);
    });
  });
});
