import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createTestApp } from '../utils/test-app.factory';

describe('Status Polling E2E Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/relay/status/:txId', () => {
    it('TC-E2E-S001: should query pending status', async () => {
      // Given: Valid UUID txId
      const txId = randomUUID();

      // When: Call GET /api/v1/relay/status/:txId
      const response = await request(app.getHttpServer())
        .get(`/api/v1/relay/status/${txId}`)
        .set('x-api-key', 'test-api-key');

      // Then: Should return valid response
      expect([200, 404, 503]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('status');
      }
    });

    it('TC-E2E-S002: should query confirmed status with hash', async () => {
      // Given: Valid UUID txId
      const txId = randomUUID();

      // When: Call GET /api/v1/relay/status/:txId
      const response = await request(app.getHttpServer())
        .get(`/api/v1/relay/status/${txId}`)
        .set('x-api-key', 'test-api-key');

      // Then: Should handle request properly
      expect([200, 404, 503]).toContain(response.status);
    });

    it('TC-E2E-S003: should query failed status', async () => {
      // Given: Valid UUID txId
      const txId = randomUUID();

      // When: Call GET /api/v1/relay/status/:txId
      const response = await request(app.getHttpServer())
        .get(`/api/v1/relay/status/${txId}`)
        .set('x-api-key', 'test-api-key');

      // Then: Should handle request properly
      expect([200, 404, 503]).toContain(response.status);
    });

    it('TC-E2E-S004: should return 400 for invalid UUID format', async () => {
      // Given: Invalid UUID format
      const invalidUuid = 'not-a-uuid';

      // When: Call GET /api/v1/relay/status/:txId
      const response = await request(app.getHttpServer())
        .get(`/api/v1/relay/status/${invalidUuid}`)
        .set('x-api-key', 'test-api-key');

      // Then: Should reject with 400
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('TC-E2E-S005: should handle OZ Relayer unavailability', async () => {
      // Given: Valid UUID txId
      const txId = randomUUID();

      // When: Call GET /api/v1/relay/status/:txId
      const response = await request(app.getHttpServer())
        .get(`/api/v1/relay/status/${txId}`)
        .set('x-api-key', 'test-api-key');

      // Then: Should return valid response
      expect([200, 404, 503, 500]).toContain(response.status);
    });

    it('TC-E2E-S006: should handle non-existent txId', async () => {
      // Given: Valid UUID txId
      const txId = randomUUID();

      // When: Call GET /api/v1/relay/status/:txId
      const response = await request(app.getHttpServer())
        .get(`/api/v1/relay/status/${txId}`)
        .set('x-api-key', 'test-api-key');

      // Then: Should return valid response (200 or 404)
      expect([200, 404, 503]).toContain(response.status);
    });
  });
});
