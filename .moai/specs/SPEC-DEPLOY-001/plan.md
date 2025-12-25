# SPEC-DEPLOY-001 구현 계획

## 개요

이 문서는 SPEC-DEPLOY-001(API 문서화 및 운영 가이드)의 구체적인 구현 계획을 정의합니다.

**목표:**
- Swagger/OpenAPI 기반 자동 API 문서 생성
- 환경별 설정 파일 구성
- 운영 가이드 작성

**구현 순서:**
1. Swagger/OpenAPI 통합 (우선순위: High) - ✅ 완료
2. 환경별 설정 파일 (우선순위: Medium) - ✅ 완료
3. Operations Guide (우선순위: Medium) - ✅ 완료

---

## Phase 1: Swagger/OpenAPI 통합 (우선순위: High)

### 1.1 SwaggerModule 설정

**작업:**
- `packages/relay-api/src/main.ts`에 SwaggerModule 설정 추가

**구현 내용:**
```typescript
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('MSQ Relayer Service API')
    .setDescription('Meta Transaction Relay Infrastructure API Documentation')
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Enable CORS
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`MSQ Relayer API Gateway is running on port ${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  console.log(`OpenAPI JSON: http://localhost:${port}/api/docs-json`);
}

bootstrap();
```

**검증:**
- 서비스 시작 후 `http://localhost:3000/api/docs` 접근 확인
- `http://localhost:3000/api/docs-json` 다운로드 및 스키마 검증

---

### 1.2 컨트롤러 문서화

**작업:**
- 모든 컨트롤러에 `@ApiOperation`, `@ApiResponse` 데코레이터 추가

**예시: HealthController**
```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Health Check',
    description: '서비스 상태를 확인합니다. 모든 의존 서비스(Redis, Relayers)의 연결 상태를 포함합니다.',
  })
  @ApiResponse({
    status: 200,
    description: '서비스가 정상적으로 작동 중입니다.',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2024-12-25T12:00:00.000Z',
        services: {
          redis: 'connected',
          relayers: ['relayer-1: ok', 'relayer-2: ok', 'relayer-3: ok'],
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: '하나 이상의 의존 서비스가 실패했습니다.',
  })
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
```

**문서화 대상 컨트롤러:**
- HealthController
- RelayController (Direct TX)
- GaslessController (Gasless TX)
- StatusController (TX Status)
- 기타 모든 컨트롤러

**검증:**
- Swagger UI에서 각 엔드포인트의 문서 확인
- "Try it out" 기능으로 API 테스트

---

### 1.3 DTO 문서화

**작업:**
- 모든 DTO에 `@ApiProperty` 데코레이터 추가

**예시: CreateRelayRequestDto**
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateRelayRequestDto {
  @ApiProperty({
    description: '메타 트랜잭션 요청자의 지갑 주소',
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  })
  @IsString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({
    description: '트랜잭션 수신자 주소',
    example: '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
  })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({
    description: '트랜잭션 데이터 (hex 인코딩)',
    example: '0xa9059cbb000000000000000000000000...',
  })
  @IsString()
  @IsNotEmpty()
  data: string;

  @ApiProperty({
    description: 'Gas Limit',
    example: 100000,
  })
  @IsNumber()
  gasLimit: number;
}
```

**문서화 대상 DTO:**
- CreateRelayRequestDto
- CreateGaslessRequestDto
- RelayResponseDto
- TxStatusResponseDto
- 기타 모든 요청/응답 DTO

**검증:**
- Swagger UI에서 각 DTO의 스키마 확인
- 예제 값이 올바르게 표시되는지 확인

---

### 1.4 API Key 인증 문서화

**작업:**
- Swagger UI에서 API Key 입력 UI 활성화

**구현 내용:**
```typescript
// main.ts
const config = new DocumentBuilder()
  .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
  .build();
```

**컨트롤러에 보안 적용:**
```typescript
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';

@ApiSecurity('api-key')
@Controller('relay')
export class RelayController {
  // ...
}
```

**검증:**
- Swagger UI 상단에 "Authorize" 버튼 확인
- API Key 입력 후 인증된 요청 테스트

---

## Phase 2: 환경별 설정 파일 (우선순위: Medium)

### 2.1 환경 파일 생성

**파일 목록:**
- `.env.development`
- `.env.staging`
- `.env.production`
- `.env.example`

**`.env.development` (로컬 개발):**
```env
NODE_ENV=development
PORT=3000
RELAY_API_KEY=local-dev-api-key
REDIS_HOST=localhost
REDIS_PORT=6379
RPC_URL=http://localhost:8545
```

**`.env.staging` (스테이징 환경):**
```env
NODE_ENV=staging
PORT=3000
RELAY_API_KEY=staging-api-key-change-me
REDIS_HOST=redis
REDIS_PORT=6379
RPC_URL=https://rpc-amoy.polygon.technology
```

**`.env.production` (프로덕션 환경):**
```env
NODE_ENV=production
PORT=3000
RELAY_API_KEY=production-api-key-change-me
REDIS_HOST=redis
REDIS_PORT=6379
RPC_URL=https://polygon-rpc.com
```

**`.env.example` (템플릿, Git 포함):**
```env
NODE_ENV=development
PORT=3000
RELAY_API_KEY=your-api-key-here
REDIS_HOST=localhost
REDIS_PORT=6379
RPC_URL=http://localhost:8545
```

**`.gitignore` 업데이트:**
```gitignore
# Environment files (exclude production secrets)
.env.development
.env.staging
.env.production

# Include template
!.env.example
```

**검증:**
- `.env.example`만 Git에 포함되는지 확인
- 각 환경 파일로 서비스 시작 테스트

---

## Phase 3: Operations Guide (우선순위: Medium)

### 3.1 docs/operations.md 작성

**파일 위치:**
- `docs/operations.md`

**문서 구조:**

#### 1. 서비스 시작/중지 절차

**서비스 시작:**
```bash
# 개발 환경 시작
cd packages/relay-api
pnpm run start:dev

# 또는 Docker 개발 환경
docker compose -f docker/docker-compose.yaml up -d
```

**서비스 중지:**
```bash
# Docker 개발 환경 중지
docker compose -f docker/docker-compose.yaml down
```

**서비스 상태 확인:**
```bash
# Health Check
curl http://localhost:3000/api/v1/health

# 또는
curl http://localhost:3001/api/v1/health
curl http://localhost:3002/api/v1/health
```

#### 2. API 문서 접근 방법

**Swagger UI:**
- relay-api-1: http://localhost:3001/api/docs
- relay-api-2: http://localhost:3002/api/docs

**OpenAPI JSON:**
- relay-api-1: http://localhost:3001/api/docs-json
- relay-api-2: http://localhost:3002/api/docs-json

**API Key 인증:**
1. Swagger UI에서 "Authorize" 버튼 클릭
2. `x-api-key` 값 입력
3. "Authorize" 클릭하여 인증 활성화

#### 3. Client SDK 생성 가이드

**OpenAPI JSON 추출:**
```bash
make api-docs
```

**TypeScript Client SDK 생성:**
```bash
make generate-client
```

**생성된 SDK 사용:**
```typescript
import { DefaultApi } from './generated/client';

const api = new DefaultApi({
  basePath: 'http://localhost:3001',
  headers: { 'x-api-key': 'your-api-key' }
});

const response = await api.healthCheck();
console.log(response.data);
```

#### 4. 모니터링 및 트러블슈팅

**로그 확인:**
```bash
# relay-api-1 로그
docker logs msq-relay-api-1

# relay-api-2 로그
docker logs msq-relay-api-2

# 실시간 로그 추적
docker logs -f msq-relay-api-1
```

**일반적인 트러블슈팅 시나리오:**

**시나리오 1: Health Check 실패**
- 증상: Health Check 엔드포인트가 503 에러 반환
- 원인: Redis 연결 실패 또는 Relayer 연결 실패
- 해결:
  ```bash
  # Redis 상태 확인
  docker logs msq-redis-prod

  # Relayer 상태 확인
  docker logs msq-oz-relayer-1-prod
  ```

**시나리오 2: 환경 변수 누락**
- 증상: 서비스 시작 시 에러 로그 출력
- 원인: 필수 환경 변수 미설정
- 해결:
  ```bash
  # .env.production 파일 확인
  cat .env.production

  # 누락된 환경 변수 추가
  ```

**시나리오 3: 포트 충돌**
- 증상: `bind: address already in use` 에러
- 원인: 3001 또는 3002 포트가 이미 사용 중
- 해결:
  ```bash
  # 포트 사용 중인 프로세스 확인
  lsof -i :3001
  lsof -i :3002

  # 또는 docker-compose.prod.yml에서 포트 변경
  ```

**검증:**
- `docs/operations.md` 파일 생성 확인
- 신규 인력이 문서만 보고 서비스 운영 가능한지 검토

---

## 구현 우선순위 요약

| Phase | 우선순위 | 상태 |
|-------|---------|------|
| Phase 1: Swagger/OpenAPI 통합 | High | ✅ 완료 |
| Phase 2: 환경별 설정 파일 | Medium | ✅ 완료 |
| Phase 3: Operations Guide | Medium | ✅ 완료 |

---

## 리스크 및 대응 방안

### 리스크 1: Swagger UI 접근 제한 설정 누락
- **영향:** 외부에서 API 문서 노출
- **대응:** Swagger UI는 내부 네트워크에서만 접근 가능하도록 설정 또는 API Key 인증 추가

### 리스크 2: 환경 변수 파일 Git 커밋
- **영향:** 프로덕션 API Key 유출
- **대응:** `.gitignore`에 명시적으로 추가, Pre-commit Hook 설정 (선택 사항)

---

## 구현 완료

모든 Phase가 완료되었습니다:

1. ✅ **Phase 1**: Swagger/OpenAPI 통합 완료
2. ✅ **Phase 2**: 환경별 설정 파일 생성 완료
3. ✅ **Phase 3**: 운영 가이드 작성 완료

---

**마지막 업데이트:** 2024-12-25
**작성자:** @user
**SPEC 버전:** 2.0.0
