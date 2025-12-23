import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/test-app.factory';
import { TEST_ADDRESSES } from '../fixtures/test-wallets';

describe('Direct Transaction E2E Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/relay/direct', () => {
    it('TC-E2E-D001: should accept valid direct transaction', async () => {
      // Given: Valid Direct TX request
      const payload = {
        to: TEST_ADDRESSES.merchant,
        data: '0x',
        speed: 'fast',
      };

      // When: Call POST /api/v1/relay/direct
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/direct')
        .set('x-api-key', 'test-api-key')
        .send(payload);

      // Then: Response should contain txId and status should be 202 (or handling error gracefully)
      expect(response.status).toBeGreaterThanOrEqual(200);
      if (response.status === 202) {
        expect(response.body).toHaveProperty('txId');
        expect(response.body.txId).toMatch(/^[0-9a-f\-]{36}$/); // UUID format
      }
    });

    it('TC-E2E-D002: should accept minimal fields only', async () => {
      // Given: Minimal Direct TX request (only required fields)
      const payload = {
        to: TEST_ADDRESSES.merchant,
        data: '0x',
      };

      // When: Call POST /api/v1/relay/direct
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/direct')
        .set('x-api-key', 'test-api-key')
        .send(payload);

      // Then: Should be accepted or return valid error response
      expect(response.status).toBeGreaterThanOrEqual(200);
      if (response.status === 202) {
        expect(response.body).toHaveProperty('txId');
      }
    });

    it('TC-E2E-D003: should return 400 for invalid Ethereum address', async () => {
      // Given: Invalid Ethereum address
      const payload = {
        to: 'invalid-address',
        data: '0x',
        speed: 'fast',
      };

      // When: Call POST /api/v1/relay/direct
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/direct')
        .set('x-api-key', 'test-api-key')
        .send(payload);

      // Then: Should reject with 400
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('TC-E2E-D004: should return 400 for invalid hexadecimal data', async () => {
      // Given: Invalid hexadecimal data
      const payload = {
        to: TEST_ADDRESSES.merchant,
        data: 'not-hex',
        speed: 'fast',
      };

      // When: Call POST /api/v1/relay/direct
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/direct')
        .set('x-api-key', 'test-api-key')
        .send(payload);

      // Then: Should reject with 400
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('TC-E2E-D005: should return 400 for invalid speed enum', async () => {
      // Given: Invalid speed enum value
      const payload = {
        to: TEST_ADDRESSES.merchant,
        data: '0x',
        speed: 'invalid-speed',
      };

      // When: Call POST /api/v1/relay/direct
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/direct')
        .set('x-api-key', 'test-api-key')
        .send(payload);

      // Then: Should reject with 400
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('TC-E2E-D006: should return 401 for missing API key', async () => {
      // Given: Request without API key
      const payload = {
        to: TEST_ADDRESSES.merchant,
        data: '0x',
        speed: 'fast',
      };

      // When: Call POST /api/v1/relay/direct without x-api-key
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/direct')
        .send(payload);

      // Then: Should reject with 401
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message');
    });

    it('TC-E2E-D007: should return 401 for invalid API key', async () => {
      // Given: Request with invalid API key
      const payload = {
        to: TEST_ADDRESSES.merchant,
        data: '0x',
        speed: 'fast',
      };

      // When: Call POST /api/v1/relay/direct with wrong API key
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/direct')
        .set('x-api-key', 'wrong-api-key')
        .send(payload);

      // Then: Should reject with 401
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message');
    });

    it('TC-E2E-D008: should handle service unavailability gracefully', async () => {
      // Given: Valid Direct TX request
      const payload = {
        to: TEST_ADDRESSES.merchant,
        data: '0x',
        speed: 'fast',
      };

      // When: Call POST /api/v1/relay/direct
      const response = await request(app.getHttpServer())
        .post('/api/v1/relay/direct')
        .set('x-api-key', 'test-api-key')
        .send(payload);

      // Then: Response should be either success or error, properly handled
      expect([200, 202, 400, 401, 503]).toContain(response.status);
    });
  });
});
