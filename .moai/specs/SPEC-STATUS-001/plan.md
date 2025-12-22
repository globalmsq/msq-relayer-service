---
id: SPEC-STATUS-001
title: Transaction Status Polling API - Implementation Plan
version: 1.3.0
status: draft
created: 2025-12-22
updated: 2025-12-22
---

## HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-22 | @user | Initial implementation plan |
| 1.1.0 | 2025-12-22 | @user | Code Review: Direct HTTP calls approach |
| 1.2.0 | 2025-12-22 | @user | Code Review: Pre-implementation requirements |
| 1.3.0 | 2025-12-22 | @user | Detailed review: Document consistency fixes |

# Implementation Plan: SPEC-STATUS-001

## 📋 Overview

**Objective**: Implement a polling-based transaction status API with proper 404/503 error handling.

**Scope**: Phase 1 only - No webhooks, no MySQL, no Prisma. Direct HTTP calls for error differentiation.

**Timeline**: 1-2 hours (6 new files, 1 modified file)

---

## 🔴 Code Review Findings (2025-12-22)

### Critical Issues Addressed

| # | Issue | Priority | Resolution |
|---|-------|----------|------------|
| 1 | **OzRelayerService 404 handling** | Critical | Direct HTTP calls in StatusService |
| 2 | OzRelayerTxData field mismatch | Medium | DTO uses optional fields |
| 3 | UUID v4 clarification | Low | Documentation added |
| 4 | Mock response structure | Medium | Test uses actual API schema |
| 5 | Gasless difference docs | Low | Section added to spec.md |
| 6 | Promise<any> type safety | Medium | Phase 2 improvement |
| 7 | Error response consistency | Low | Follows AllExceptionsFilter |
| 8 | RelayModule code example | Info | Updated to match actual structure |

### Key Decision: Direct HTTP Calls

**Problem**: `OzRelayerService.getTransactionStatus()` converts ALL errors to `ServiceUnavailableException`:
```typescript
// oz-relayer.service.ts (line 182-184)
} catch (error) {
  throw new ServiceUnavailableException("OZ Relayer service unavailable");
}
```

**Solution**: StatusService makes direct HTTP calls to differentiate 404 from 503:
```typescript
// status.service.ts
if (error.response?.status === 404) {
  throw new NotFoundException('Transaction not found');
}
throw new ServiceUnavailableException('OZ Relayer service unavailable');
```

**Benefits**:
- No modification to OzRelayerService (preserves stability)
- Proper 404/503 error differentiation
- No impact on DirectService/GaslessService

---

## ⚠️ Pre-Implementation Requirements (v1.2.0)

> **Critical**: Complete these steps BEFORE starting implementation.

### 1. OzRelayerService Modification

**Issue**: `getRelayerId()` is `private` (line 85)
**Action**: Change to `public`

```bash
# File: packages/relay-api/src/oz-relayer/oz-relayer.service.ts
# Line 85: Change "private async getRelayerId()" to "public async getRelayerId()"
```

### 2. Test File Imports

**Required imports** for test mocking:

```typescript
// In both status.service.spec.ts and status.controller.spec.ts
import { of, throwError } from 'rxjs';
```

### 3. Files to Modify (Pre-Implementation)

| File | Change | Priority |
|------|--------|----------|
| `oz-relayer.service.ts` | `private` → `public` for `getRelayerId()` | Critical |
| Test files | Add `of, throwError` from rxjs | Required |

---

## 🎯 Technical Approach

### Design Pattern: Direct HTTP Gateway

**Core Principle**: Direct HTTP calls for proper error handling

```
Request Flow:
1. Client → GET /status/{txId}
2. Controller validates UUID format
3. Service makes direct HTTP call to OZ Relayer
4. Catch 404 → NotFoundException, other → ServiceUnavailableException
5. Transform response to TxStatusResponseDto
6. Return to client
```

**Why This Approach?**:
- ✅ Proper 404/503 error differentiation
- ✅ No modification to existing OzRelayerService
- ✅ Stateless service design
- ✅ Easy to extend in Phase 2+

### Key Design Decisions

**Decision 1: Direct HTTP for Error Handling**
- StatusService uses HttpService directly
- OzRelayerService.getRelayerId() for relayer ID
- ConfigService for URL and API key

**Decision 2: UUID Validation in Controller**
- Use `@IsUUID('4')` validator on path parameter
- Early validation prevents unnecessary OZ Relayer calls
- Consistent with NestJS best practices

**Decision 3: Response DTO with Optional Fields**
- Direct mapping from OZ Relayer response
- Optional fields handle missing data gracefully
- Future-proof for Phase 2+ enhancements

---

## 📂 File Structure

```
packages/relay-api/src/relay/status/
├── dto/
│   └── tx-status-response.dto.ts    # ~30 LOC  - Response schema
├── status.controller.ts              # ~40 LOC  - GET endpoint
├── status.service.ts                 # ~35 LOC  - Service wrapper
├── status.module.ts                  # ~15 LOC  - Module definition
├── status.controller.spec.ts        # ~80 LOC  - Controller tests
└── status.service.spec.ts           # ~70 LOC  - Service tests

packages/relay-api/src/relay/
└── relay.module.ts                   # +2 LOC   - Import StatusModule
```

**Total**: 272 LOC (6 new files, 1 modified file)

---

## 🔨 Implementation Steps

### Step 1: Create DTO (tx-status-response.dto.ts)

**File**: `packages/relay-api/src/relay/status/dto/tx-status-response.dto.ts`

**Content**:
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TxStatusResponseDto {
  @ApiProperty({ description: 'Transaction ID' })
  transactionId: string;

  @ApiProperty({ description: 'Transaction hash (null if pending)' })
  hash: string | null;

  @ApiProperty({ description: 'Transaction status', enum: ['pending', 'confirmed', 'failed'] })
  status: string;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt: string;

  @ApiPropertyOptional({ description: 'Confirmed timestamp' })
  confirmedAt?: string;

  @ApiPropertyOptional({ description: 'From address' })
  from?: string;

  @ApiPropertyOptional({ description: 'To address' })
  to?: string;

  @ApiPropertyOptional({ description: 'Transaction value (wei)' })
  value?: string;
}
```

**Rationale**: Matches OZ Relayer response schema with optional fields for flexibility.

---

### Step 2: Create Service (status.service.ts)

**File**: `packages/relay-api/src/relay/status/status.service.ts`

**Content**:
```typescript
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { OzRelayerService } from '../../oz-relayer/oz-relayer.service';
import { TxStatusResponseDto } from './dto/tx-status-response.dto';

/**
 * StatusService - Transaction Status Query
 *
 * SPEC-STATUS-001: Transaction Status Polling API - Phase 1
 * Direct HTTP calls for proper 404/503 error differentiation
 */
@Injectable()
export class StatusService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly ozRelayerService: OzRelayerService,
  ) {}

  /**
   * Query transaction status from OZ Relayer
   *
   * @param txId - Transaction ID (UUID v4)
   * @returns TxStatusResponseDto with status, hash, and execution details
   * @throws NotFoundException if transaction not found (404)
   * @throws ServiceUnavailableException if OZ Relayer unavailable
   */
  async getTransactionStatus(txId: string): Promise<TxStatusResponseDto> {
    try {
      // Direct HTTP call for proper 404/503 error handling
      const relayerId = await this.ozRelayerService.getRelayerId();
      const relayerUrl = this.configService.get<string>('OZ_RELAYER_URL');
      const apiKey = this.configService.get<string>('OZ_RELAYER_API_KEY');

      const response = await firstValueFrom(
        this.httpService.get(
          `${relayerUrl}/api/v1/relayers/${relayerId}/transactions/${txId}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 10000,
          },
        ),
      );

      // Transform OZ Relayer response to standardized DTO
      return {
        transactionId: response.data.data?.id || response.data.id,
        hash: response.data.data?.hash || response.data.hash,
        status: response.data.data?.status || response.data.status,
        createdAt: response.data.data?.created_at || response.data.created_at,
        confirmedAt: response.data.data?.confirmed_at,
        from: response.data.data?.from,
        to: response.data.data?.to,
        value: response.data.data?.value,
      };
    } catch (error) {
      // 404: Transaction not found
      if (error.response?.status === 404) {
        throw new NotFoundException('Transaction not found');
      }
      // All other errors: Service unavailable
      throw new ServiceUnavailableException('OZ Relayer service unavailable');
    }
  }
}
```

**Key Points**:
- Direct HTTP calls using HttpService (not OzRelayerService.getTransactionStatus())
- Uses OzRelayerService.getRelayerId() for relayer ID
- Proper 404 → NotFoundException, other → ServiceUnavailableException
- Response transformation handles both nested and flat response structures

---

### Step 3: Create Controller (status.controller.ts)

**File**: `packages/relay-api/src/relay/status/status.controller.ts`

**Content**:
```typescript
import { Controller, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { StatusService } from './status.service';
import { TxStatusResponseDto } from './dto/tx-status-response.dto';

/**
 * Transaction ID Path Parameter DTO
 * Validates UUID v4 format before service call
 */
class TxIdParamDto {
  @IsUUID('4', { message: 'Invalid transaction ID format' })
  txId: string;
}

@ApiTags('Transaction Status')
@Controller('relay/status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  @Get(':txId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Query transaction status by ID' })
  @ApiParam({ name: 'txId', description: 'Transaction ID (UUID v4)', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiResponse({ status: 200, description: 'Transaction status retrieved', type: TxStatusResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid transaction ID format' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 503, description: 'OZ Relayer service unavailable' })
  async getTransactionStatus(
    @Param() params: TxIdParamDto,
  ): Promise<TxStatusResponseDto> {
    return this.statusService.getTransactionStatus(params.txId);
  }
}
```

**Key Points**:
- UUID v4 validation via `TxIdParamDto`
- Comprehensive Swagger annotations
- Single endpoint: `GET /relay/status/:txId`
- Error responses handled by NestJS exception filters

---

### Step 4: Create Module (status.module.ts)

**File**: `packages/relay-api/src/relay/status/status.module.ts`

**Content**:
```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { OzRelayerModule } from '../../oz-relayer/oz-relayer.module';

@Module({
  imports: [
    HttpModule,       // Direct HTTP calls to OZ Relayer
    OzRelayerModule,  // getRelayerId() method
  ],
  controllers: [StatusController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
```

**Dependencies**:
- HttpModule (for direct HTTP calls)
- OzRelayerModule (for getRelayerId())

---

### Step 5: Update Relay Module (relay.module.ts)

**File**: `packages/relay-api/src/relay/relay.module.ts`

**Current Structure**:
```typescript
@Module({
  imports: [HttpModule, OzRelayerModule, GaslessModule],
  controllers: [DirectController],
  providers: [DirectService],
})
export class RelayModule {}
```

**Modification** (add StatusModule import):
```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OzRelayerModule } from '../oz-relayer/oz-relayer.module';
import { GaslessModule } from './gasless/gasless.module';
import { StatusModule } from './status/status.module'; // ADD THIS
import { DirectController } from './direct/direct.controller';
import { DirectService } from './direct/direct.service';

@Module({
  imports: [
    HttpModule,
    OzRelayerModule,
    GaslessModule,
    StatusModule,  // ADD THIS
  ],
  controllers: [DirectController],
  providers: [DirectService],
})
export class RelayModule {}
```

**Change**: Add `StatusModule` import (2 lines added)

---

### Step 6: Write Service Tests (status.service.spec.ts)

**File**: `packages/relay-api/src/relay/status/status.service.spec.ts`

**Test Cases** (4 tests):
```typescript
describe('StatusService', () => {
  // Test 1: Valid transaction ID returns status
  it('should return transaction status for valid ID', async () => {
    // Mock HttpService.get() response
    // Mock OzRelayerService.getRelayerId()
    // Verify response transformation
  });

  // Test 2: Transaction not found (404) throws NotFoundException
  it('should throw NotFoundException when transaction not found', async () => {
    // Mock HttpService.get() to throw with response.status = 404
    // Expect NotFoundException
  });

  // Test 3: OZ Relayer unavailable throws ServiceUnavailableException
  it('should throw ServiceUnavailableException when OZ Relayer unavailable', async () => {
    // Mock HttpService.get() to throw network error
    // Expect ServiceUnavailableException
  });

  // Test 4: Response transformation correctness
  it('should correctly transform OZ Relayer response to DTO', async () => {
    // Verify field mapping (nested and flat structures)
  });
});
```

---

### Step 7: Write Controller Tests (status.controller.spec.ts)

**File**: `packages/relay-api/src/relay/status/status.controller.spec.ts`

**Test Cases** (5 tests):
```typescript
describe('StatusController', () => {
  // Test 1: GET /status/:txId with valid ID returns 200 OK
  it('GET /status/:txId should return 200 OK for valid transaction ID', async () => {
    // Mock StatusService response
    // Verify HTTP 200 and DTO structure
  });

  // Test 2: Invalid UUID returns 400 Bad Request
  it('GET /status/:txId should return 400 for invalid UUID format', async () => {
    // Send invalid UUID
    // Expect HTTP 400
  });

  // Test 3: Transaction not found returns 404
  it('GET /status/:txId should return 404 when transaction not found', async () => {
    // Mock NotFoundException
    // Verify HTTP 404
  });

  // Test 4: OZ Relayer unavailable returns 503
  it('GET /status/:txId should return 503 when OZ Relayer unavailable', async () => {
    // Mock ServiceUnavailableException
    // Verify HTTP 503
  });

  // Test 5: Response matches TxStatusResponseDto schema
  it('GET /status/:txId response should match TxStatusResponseDto schema', async () => {
    // Validate response structure
  });
});
```

---

## 🧪 Testing Strategy

### Unit Test Coverage: 90%+

**Coverage Targets**:
- StatusService: 100% (4 test cases, all code paths)
- StatusController: 95% (5 test cases, validation + error handling)

**Mocking Strategy**:
- Mock OzRelayerService methods
- Mock HTTP responses from OZ Relayer
- Verify DTO transformations

### Integration Test (E2E)

**Scenario**: Complete transaction lifecycle
```typescript
// 1. Submit direct transaction
const txResponse = await POST('/api/v1/relay/direct', directTxDto);
const txId = txResponse.transactionId;

// 2. Query status immediately (should be "pending")
const status1 = await GET(`/api/v1/relay/status/${txId}`);
expect(status1.status).toBe('pending');

// 3. Wait for confirmation (mock or real blockchain)
await waitForConfirmation();

// 4. Query status again (should be "confirmed")
const status2 = await GET(`/api/v1/relay/status/${txId}`);
expect(status2.status).toBe('confirmed');
expect(status2.hash).not.toBeNull();
```

---

## 🔧 Environment Configuration

**No New Environment Variables Required**:
- Uses existing `OZ_RELAYER_URL`
- Uses existing `OZ_RELAYER_API_KEY`
- No database connection needed (Phase 1)

---

## 📊 Success Criteria

### Technical Validation
- [ ] All 9 unit tests pass (4 service + 5 controller)
- [ ] Test coverage ≥90% for status module
- [ ] E2E test demonstrates complete transaction lifecycle
- [ ] No linting errors (ESLint + Prettier)
- [ ] Swagger UI displays endpoint documentation correctly

### Functional Validation
- [ ] Valid transaction IDs return status with HTTP 200
- [ ] Invalid UUIDs return HTTP 400 before OZ Relayer call
- [ ] Non-existent transactions return HTTP 404
- [ ] OZ Relayer errors return HTTP 503
- [ ] Response matches TxStatusResponseDto schema

### Code Quality
- [ ] Follows existing DirectService/GaslessService patterns
- [ ] Single responsibility: status query only
- [ ] No business logic in controller (validation only)
- [ ] Service methods are well-documented with JSDoc
- [ ] Comprehensive error handling

---

## 🚀 Deployment Steps

### Pre-deployment Checklist
- [ ] All tests pass: `pnpm test:cov`
- [ ] Linting passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`
- [ ] Swagger documentation accessible at `/api`

### Deployment Process (Phase 1)
1. Merge feature branch to `develop`
2. Run CI/CD pipeline (tests + build)
3. Deploy to staging environment
4. Verify endpoint: `GET /api/v1/relay/status/{test-tx-id}`
5. Monitor logs for errors
6. Deploy to production

**No Database Migration Required**: Phase 1 is stateless (no MySQL)

---

## 🔄 Phase 2+ Migration Path

### Phase 2: Webhook Notifications
**SPEC-WEBHOOK-001** (Separate SPEC):
- Add webhook URL storage (MySQL + Prisma)
- Implement webhook callback system
- Status change triggers (pending → confirmed → failed)

### Phase 3: Transaction History
**SPEC-HISTORY-001** (Separate SPEC):
- Create Prisma Transaction model
- Store transaction history locally
- Query optimization with indexes

**Migration Strategy**:
- StatusService remains unchanged (backwards compatible)
- Add new methods: `saveTransaction()`, `getTransactionHistory()`
- Controller adds new endpoints: `GET /status` (paginated list)

---

## 📝 Code Review Checklist

### Before PR Submission
- [ ] Code follows NestJS best practices
- [ ] All methods have JSDoc comments
- [ ] DTOs have Swagger annotations
- [ ] Error handling is comprehensive
- [ ] Test coverage meets 90% threshold
- [ ] No hardcoded values (use environment variables)
- [ ] No console.log statements (use Logger)

### Reviewer Focus Areas
- [ ] UUID validation logic correctness
- [ ] Error transformation (404, 503) correctness
- [ ] DTO field mapping from OZ Relayer response
- [ ] Test coverage completeness
- [ ] Swagger documentation clarity

---

## 📚 References

### Internal Documentation
- SPEC-PROXY-001: OzRelayerService implementation
- SPEC-GASLESS-001: GaslessService pattern reference
- DirectService: `packages/relay-api/src/relay/direct/direct.service.ts`

### External Documentation
- NestJS Controllers: https://docs.nestjs.com/controllers
- NestJS Validation: https://docs.nestjs.com/techniques/validation
- Swagger/OpenAPI: https://docs.nestjs.com/openapi/introduction
- class-validator UUID: https://github.com/typestack/class-validator#validation-decorators

---

## 🎯 Implementation Priority

**High Priority** (Must-Have):
- DTO definition (required for API contract)
- Service wrapper (core functionality)
- Controller endpoint (API entry point)

**Medium Priority** (Should-Have):
- Unit tests (quality assurance)
- Swagger annotations (documentation)

**Low Priority** (Nice-to-Have):
- E2E tests (can be added later)
- Advanced error handling (can be enhanced in Phase 2+)

---

**Version**: 1.2.0
**Status**: Draft
**Last Updated**: 2025-12-22
