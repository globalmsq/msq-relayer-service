---
id: SPEC-STATUS-001
title: Transaction Status Polling API - Acceptance Criteria
version: 1.3.0
status: draft
created: 2025-12-22
updated: 2025-12-22
---

# Acceptance Criteria: SPEC-STATUS-001

## HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-22 | @user | Initial acceptance criteria |
| 1.1.0 | 2025-12-22 | @user | Code Review: Updated test implementations to reflect direct HTTP calls |
| 1.2.0 | 2025-12-22 | @user | Code Review: Added rxjs import requirements, pre-implementation notes |
| 1.3.0 | 2025-12-22 | @user | Detailed review: Document consistency fixes |

## 📋 Overview

**Purpose**: Define clear, testable acceptance criteria for Transaction Status Polling API - Phase 1.

**Scope**: Polling-based status query only. Webhooks, MySQL, and Prisma are out of scope (Phase 2+).

**Quality Gate**: All acceptance criteria must pass before marking SPEC as completed.

### Test File Requirements (v1.2.0)

> **Note**: All test files require the following rxjs imports for HttpService mocking:

```typescript
import { of, throwError } from 'rxjs';
```

---

## ✅ Functional Acceptance Criteria

### AC-1: Valid Transaction Status Query

**Scenario**: Query status for existing transaction

**Given**:
- User has submitted a transaction via `/direct` or `/gasless`
- User has received a valid transaction ID in response
- Transaction exists in OZ Relayer

**When**:
- User sends `GET /api/v1/relay/status/{txId}` with valid transaction ID

**Then**:
- API returns HTTP 200 OK
- Response body matches `TxStatusResponseDto` schema
- Response includes:
  - `transactionId`: UUID v4 format
  - `hash`: Transaction hash (string) or null (if pending)
  - `status`: One of "pending", "confirmed", "failed"
  - `createdAt`: ISO 8601 timestamp string
  - Optional fields: `confirmedAt`, `from`, `to`, `value`

**Example Response**:
```json
{
  "transactionId": "123e4567-e89b-12d3-a456-426614174000",
  "hash": "0x1234567890abcdef...",
  "status": "confirmed",
  "createdAt": "2025-12-22T10:00:00.000Z",
  "confirmedAt": "2025-12-22T10:05:00.000Z",
  "from": "0xUser123...",
  "to": "0xContract456...",
  "value": "1000000000000000000"
}
```

**Test Implementation**:
```typescript
it('should return transaction status for valid transaction ID', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/v1/relay/status/123e4567-e89b-12d3-a456-426614174000')
    .expect(200);

  expect(response.body).toMatchObject({
    transactionId: expect.any(String),
    hash: expect.any(String),
    status: expect.stringMatching(/^(pending|confirmed|failed)$/),
    createdAt: expect.any(String),
  });
});
```

---

### AC-2: Invalid UUID Format Handling

**Scenario**: Request with malformed transaction ID

**Given**:
- User provides an invalid UUID format in request

**When**:
- User sends `GET /api/v1/relay/status/{invalidId}`
- Examples:
  - Non-UUID string: `GET /status/not-a-uuid`
  - UUID v1 instead of v4: `GET /status/123e4567-e89b-11d3-a456-426614174000`
  - Empty string: `GET /status/`

> **Note (Code Review v1.1.0)**: UUID v4 is the format used by OZ Relayer for transaction IDs.
> The third group's first character distinguishes versions: v4 uses `4` (e.g., `12d3`), v1 uses `1` (e.g., `11d3`).

**Then**:
- API returns HTTP 400 Bad Request
- Response includes validation error message
- OZ Relayer is NOT called (early validation)

**Example Response**:
```json
{
  "statusCode": 400,
  "message": "Invalid transaction ID format",
  "error": "Bad Request"
}
```

**Test Implementation**:
```typescript
it('should return 400 for invalid UUID format', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/v1/relay/status/not-a-valid-uuid')
    .expect(400);

  expect(response.body.message).toContain('Invalid transaction ID format');
});
```

---

### AC-3: Transaction Not Found Handling

**Scenario**: Query non-existent transaction

**Given**:
- User provides a valid UUID v4 format
- Transaction does NOT exist in OZ Relayer

**When**:
- User sends `GET /api/v1/relay/status/{nonExistentId}`
- OZ Relayer returns 404 response

**Then**:
- API returns HTTP 404 Not Found
- Response includes clear error message

**Example Response**:
```json
{
  "statusCode": 404,
  "message": "Transaction not found",
  "error": "Not Found"
}
```

**Test Implementation**:
```typescript
it('should return 404 when transaction not found', async () => {
  // Mock HttpService to throw 404 (StatusService uses direct HTTP calls)
  const axiosError = {
    response: { status: 404, data: { message: 'Not found' } },
  };
  jest.spyOn(httpService, 'get').mockImplementation(() => throwError(() => axiosError));

  const response = await request(app.getHttpServer())
    .get('/api/v1/relay/status/123e4567-e89b-12d3-a456-426614174000')
    .expect(404);

  expect(response.body.message).toBe('Transaction not found');
});
```

> **Note (Code Review v1.1.0)**: StatusService uses direct HTTP calls via HttpService instead of
> OzRelayerService.getTransactionStatus() to properly differentiate 404 from 503 errors.

---

### AC-4: OZ Relayer Service Unavailable Handling

**Scenario**: OZ Relayer is down or timeout occurs

**Given**:
- User provides a valid transaction ID
- OZ Relayer is unavailable (network error, timeout, or service down)

**When**:
- User sends `GET /api/v1/relay/status/{txId}`
- OZ Relayer call fails with timeout or connection error

**Then**:
- API returns HTTP 503 Service Unavailable
- Response includes error message indicating service unavailability

**Example Response**:
```json
{
  "statusCode": 503,
  "message": "OZ Relayer service unavailable",
  "error": "Service Unavailable"
}
```

**Test Implementation**:
```typescript
it('should return 503 when OZ Relayer unavailable', async () => {
  // Mock HttpService to throw network error (StatusService uses direct HTTP calls)
  const networkError = new Error('ECONNREFUSED');
  jest.spyOn(httpService, 'get').mockImplementation(() => throwError(() => networkError));

  const response = await request(app.getHttpServer())
    .get('/api/v1/relay/status/123e4567-e89b-12d3-a456-426614174000')
    .expect(503);

  expect(response.body.message).toContain('OZ Relayer service unavailable');
});
```

---

### AC-5: Authentication Requirement

**Scenario**: Unauthorized access attempt

**Given**:
- User does NOT provide valid API key

**When**:
- User sends `GET /api/v1/relay/status/{txId}` without `X-API-Key` header

**Then**:
- API returns HTTP 401 Unauthorized (handled by existing middleware)

**Example Response**:
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**Test Implementation**:
```typescript
it('should return 401 when API key missing', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/v1/relay/status/123e4567-e89b-12d3-a456-426614174000')
    // No X-API-Key header
    .expect(401);
});
```

---

## 🧪 Technical Acceptance Criteria

### AC-6: Test Coverage Threshold

**Criteria**: Test coverage ≥90% for status module

**Measurement**:
- Run `pnpm test:cov`
- Verify coverage report for `status/` directory

**Required Coverage**:
- Line coverage: ≥90%
- Branch coverage: ≥85%
- Function coverage: ≥90%

**Test Implementation**:
```bash
pnpm test:cov -- status
# Verify output:
# Statements   : 90% (X/Y)
# Branches     : 85% (X/Y)
# Functions    : 90% (X/Y)
# Lines        : 90% (X/Y)
```

---

### AC-7: Response DTO Validation

**Criteria**: Response matches TxStatusResponseDto schema exactly

**Given**:
- API returns successful response

**When**:
- Response is validated against TypeScript types and Swagger schema

**Then**:
- All required fields are present
- Field types match DTO definition
- Optional fields are correctly typed (string | undefined)
- Swagger UI displays correct schema

**Test Implementation**:
```typescript
it('should match TxStatusResponseDto schema', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/v1/relay/status/123e4567-e89b-12d3-a456-426614174000')
    .expect(200);

  // Required fields
  expect(response.body).toHaveProperty('transactionId');
  expect(response.body).toHaveProperty('hash');
  expect(response.body).toHaveProperty('status');
  expect(response.body).toHaveProperty('createdAt');

  // Optional fields (if present, must be strings)
  if (response.body.confirmedAt) {
    expect(typeof response.body.confirmedAt).toBe('string');
  }
  if (response.body.from) {
    expect(typeof response.body.from).toBe('string');
  }
});
```

---

### AC-8: Swagger Documentation Completeness

**Criteria**: Endpoint is fully documented in Swagger UI

**Given**:
- Swagger UI is accessible at `/api`

**When**:
- Developer navigates to Transaction Status section

**Then**:
- Endpoint `GET /relay/status/{txId}` is visible
- Path parameter `txId` has description and example
- Response schema shows `TxStatusResponseDto`
- All HTTP status codes documented:
  - 200: Success
  - 400: Bad Request
  - 404: Not Found
  - 503: Service Unavailable

**Manual Verification**:
1. Navigate to `http://localhost:3000/api`
2. Expand "Transaction Status" section
3. Verify endpoint documentation completeness

---

### AC-9: Service Integration with Direct HTTP Calls

**Criteria**: StatusService correctly makes direct HTTP calls to OZ Relayer

> **Note (Code Review v1.1.0)**: StatusService uses direct HTTP calls instead of
> OzRelayerService.getTransactionStatus() to properly differentiate 404 from 503 errors.

**Given**:
- StatusService is injected with HttpService, ConfigService, and OzRelayerService

**When**:
- StatusService.getTransactionStatus() is called

**Then**:
- Calls OzRelayerService.getRelayerId() to get relayer ID
- Makes direct HTTP call to OZ Relayer API via HttpService
- Transforms response to TxStatusResponseDto
- Returns NotFoundException for HTTP 404
- Returns ServiceUnavailableException for other errors

**Test Implementation**:
```typescript
it('should make direct HTTP call to OZ Relayer correctly', async () => {
  const mockResponse = {
    data: {
      data: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        hash: '0x123...',
        status: 'confirmed',
        created_at: '2025-12-22T10:00:00.000Z',
        confirmed_at: '2025-12-22T10:05:00.000Z',
        from: '0xUser123...',
        to: '0xContract456...',
        value: '1000000000000000000',
      },
    },
  };

  // Mock OzRelayerService.getRelayerId()
  jest.spyOn(ozRelayerService, 'getRelayerId').mockResolvedValue('test-relayer-id');

  // Mock HttpService.get() - StatusService uses direct HTTP calls
  jest.spyOn(httpService, 'get').mockImplementation(() => of(mockResponse));

  const result = await statusService.getTransactionStatus('123e4567-e89b-12d3-a456-426614174000');

  expect(ozRelayerService.getRelayerId).toHaveBeenCalledTimes(1);
  expect(httpService.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/v1/relayers/test-relayer-id/transactions/'),
    expect.any(Object),
  );
  expect(result.transactionId).toBe('123e4567-e89b-12d3-a456-426614174000');
});
```

---

## 🔄 Integration Acceptance Criteria

### AC-10: End-to-End Transaction Lifecycle

**Scenario**: Complete transaction flow from submission to status query

**Given**:
- relay-api service is running
- OZ Relayer is running and healthy

**When**:
1. Submit direct transaction: `POST /api/v1/relay/direct`
2. Receive transaction ID in response
3. Query status immediately: `GET /api/v1/relay/status/{txId}`
4. Query status again after confirmation

**Then**:
- First query returns `status: "pending"`, `hash: null`
- Second query returns `status: "confirmed"`, `hash: "0x..."`
- Transaction ID remains consistent
- All fields are correctly populated

**Test Implementation**:
```typescript
it('should handle complete transaction lifecycle', async () => {
  // Step 1: Submit transaction
  const submitResponse = await request(app.getHttpServer())
    .post('/api/v1/relay/direct')
    .set('X-API-Key', process.env.RELAY_API_KEY)
    .send({
      to: '0xContract...',
      data: '0x123...',
      value: '0',
    })
    .expect(202);

  const txId = submitResponse.body.transactionId;

  // Step 2: Query status (pending)
  const status1 = await request(app.getHttpServer())
    .get(`/api/v1/relay/status/${txId}`)
    .set('X-API-Key', process.env.RELAY_API_KEY)
    .expect(200);

  expect(status1.body.status).toBe('pending');
  expect(status1.body.hash).toBeNull();

  // Step 3: Wait for confirmation (mock or real)
  await waitForConfirmation(txId);

  // Step 4: Query status (confirmed)
  const status2 = await request(app.getHttpServer())
    .get(`/api/v1/relay/status/${txId}`)
    .set('X-API-Key', process.env.RELAY_API_KEY)
    .expect(200);

  expect(status2.body.status).toBe('confirmed');
  expect(status2.body.hash).not.toBeNull();
});
```

---

### AC-11: Gasless Transaction Status Query

**Scenario**: Query status for gasless transaction

**Given**:
- User has submitted a gasless transaction via `/api/v1/relay/gasless`
- Gasless transaction ID is returned

**When**:
- User queries status: `GET /api/v1/relay/status/{gaslessTxId}`

**Then**:
- API returns status for gasless transaction
- Response includes Forwarder execution details
- Status correctly reflects Forwarder transaction state

**Test Implementation**:
```typescript
it('should query status for gasless transaction', async () => {
  // Submit gasless transaction
  const gaslessResponse = await request(app.getHttpServer())
    .post('/api/v1/relay/gasless')
    .set('X-API-Key', process.env.RELAY_API_KEY)
    .send({
      request: { /* ForwardRequest */ },
      signature: '0x...',
    })
    .expect(202);

  const txId = gaslessResponse.body.transactionId;

  // Query status
  const status = await request(app.getHttpServer())
    .get(`/api/v1/relay/status/${txId}`)
    .set('X-API-Key', process.env.RELAY_API_KEY)
    .expect(200);

  expect(status.body.transactionId).toBe(txId);
  expect(status.body.to).toBe(process.env.FORWARDER_ADDRESS); // Forwarder address
});
```

---

## 📊 Performance Acceptance Criteria

### AC-12: Response Time

**Criteria**: API responds within acceptable latency

**Given**:
- OZ Relayer is healthy and responsive

**When**:
- User queries transaction status

**Then**:
- Response time ≤ 2 seconds (p95)
- Response time ≤ 5 seconds (p99)

**Measurement**:
```bash
# Load testing with autocannon
npx autocannon -c 10 -d 30 http://localhost:3000/api/v1/relay/status/123e4567-e89b-12d3-a456-426614174000

# Verify:
# Latency p95: ≤ 2000ms
# Latency p99: ≤ 5000ms
```

---

### AC-13: No Memory Leaks

**Criteria**: Service does not accumulate memory over time

**Given**:
- Service runs under sustained load

**When**:
- 1000+ requests are processed

**Then**:
- Memory usage remains stable
- No memory leaks detected

**Measurement**:
```bash
# Monitor memory usage during load test
node --expose-gc --inspect dist/main.js

# Run load test
npx autocannon -c 50 -d 300 http://localhost:3000/api/v1/relay/status/{txId}

# Verify memory usage does not continuously increase
```

---

## 🔒 Security Acceptance Criteria

### AC-14: API Key Authentication

**Criteria**: Endpoint requires valid API key

**Given**:
- Existing API key authentication middleware is active

**When**:
- User attempts to access endpoint without API key

**Then**:
- Request is rejected with 401 Unauthorized
- Request does NOT reach StatusController

**Test Implementation**:
```typescript
it('should require API key authentication', async () => {
  await request(app.getHttpServer())
    .get('/api/v1/relay/status/123e4567-e89b-12d3-a456-426614174000')
    .expect(401);
});
```

---

### AC-15: No Information Leakage

**Criteria**: Error messages do not leak sensitive information

**Given**:
- User queries transaction status
- Error occurs (404, 503, etc.)

**When**:
- Error response is returned

**Then**:
- Error message is generic and safe
- No OZ Relayer API keys or internal URLs exposed
- No stack traces in production environment

**Test Implementation**:
```typescript
it('should not leak sensitive information in errors', async () => {
  // Mock HttpService to throw error with sensitive data (StatusService uses direct HTTP calls)
  const sensitiveError = new Error('Internal error with API key: sk-123... at http://oz-relayer.internal');
  jest.spyOn(httpService, 'get').mockImplementation(() => throwError(() => sensitiveError));

  const response = await request(app.getHttpServer())
    .get('/api/v1/relay/status/123e4567-e89b-12d3-a456-426614174000')
    .expect(503);

  expect(response.body.message).not.toContain('sk-');
  expect(response.body.message).not.toContain('http://');
});
```

---

## 📋 Quality Gate Summary

**All acceptance criteria must pass before merging to main branch.**

### Checklist for SPEC Completion

**Functional Criteria**:
- [ ] AC-1: Valid transaction status query works
- [ ] AC-2: Invalid UUID format returns 400
- [ ] AC-3: Non-existent transaction returns 404
- [ ] AC-4: OZ Relayer unavailable returns 503
- [ ] AC-5: Authentication requirement enforced

**Technical Criteria**:
- [ ] AC-6: Test coverage ≥90%
- [ ] AC-7: Response DTO validation passes
- [ ] AC-8: Swagger documentation complete
- [ ] AC-9: Direct HTTP integration correct

**Integration Criteria**:
- [ ] AC-10: End-to-end transaction lifecycle works
- [ ] AC-11: Gasless transaction status query works

**Performance Criteria**:
- [ ] AC-12: Response time meets SLA (p95 ≤ 2s)
- [ ] AC-13: No memory leaks detected

**Security Criteria**:
- [ ] AC-14: API key authentication required
- [ ] AC-15: No sensitive information leakage

---

## 🚀 Deployment Validation

**Post-Deployment Verification**:
1. Health check passes: `GET /health`
2. Swagger UI accessible: `GET /api`
3. Status endpoint functional: `GET /api/v1/relay/status/{test-tx-id}`
4. Logs show no errors

**Rollback Criteria**:
- If any acceptance criteria fail in production
- If p95 latency exceeds 5 seconds
- If error rate exceeds 1%

---

**Version**: 1.2.0
**Status**: Draft
**Last Updated**: 2025-12-22
