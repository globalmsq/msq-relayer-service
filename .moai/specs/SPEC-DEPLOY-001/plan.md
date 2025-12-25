# SPEC-DEPLOY-001 구현 계획

## 개요

이 문서는 SPEC-DEPLOY-001(프로덕션 배포 환경 설정, API 문서화 및 운영 가이드)의 구체적인 구현 계획을 정의합니다.

**목표:**
- Swagger/OpenAPI 기반 자동 API 문서 생성
- 프로덕션 환경 2-replica 배포 설정
- 환경별 설정 파일 및 Makefile 구성
- 운영 가이드 작성

**구현 순서:**
1. Swagger/OpenAPI 통합 (우선순위: High)
2. Production Docker Compose (우선순위: High)
3. 환경별 설정 파일 (우선순위: Medium)
4. Deployment Makefile (우선순위: Medium)
5. Operations Guide (우선순위: Medium)

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

## Phase 2: Production Docker Compose (우선순위: High)

### 2.1 docker-compose.prod.yml 작성

**파일 위치:**
- `docker/docker-compose.prod.yml`

**서비스 구성:**
```yaml
version: '3.9'

services:
  relay-api-1:
    build:
      context: ..
      dockerfile: docker/Dockerfile.packages
      target: relay-api
    container_name: msq-relay-api-1
    ports:
      - "3001:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - RELAY_API_KEY=${RELAY_API_KEY}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - RPC_URL=${RPC_URL}
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - msq-relayer-network

  relay-api-2:
    build:
      context: ..
      dockerfile: docker/Dockerfile.packages
      target: relay-api
    container_name: msq-relay-api-2
    ports:
      - "3002:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - RELAY_API_KEY=${RELAY_API_KEY}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - RPC_URL=${RPC_URL}
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - msq-relayer-network

  redis:
    image: redis:8.0-alpine
    container_name: msq-redis-prod
    ports:
      - "6379:6379"
    volumes:
      - msq-relayer-redis-data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '0.3'
          memory: 128M
    networks:
      - msq-relayer-network

  oz-relayer-1:
    image: ghcr.io/openzeppelin/openzeppelin-relayer:v1.3.0
    container_name: msq-oz-relayer-1-prod
    volumes:
      - ./keys/relayer-1:/app/config/keys/relayer-1:ro
      - ./config/oz-relayer/relayer-1.json:/app/config/config.json:ro
    environment:
      - RUST_LOG=info
      - RELAY_API_KEY=${RELAY_API_KEY}
      - KEYSTORE_PASSPHRASE=${KEYSTORE_PASSPHRASE}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - RPC_URL=${RPC_URL}
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/v1/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
    networks:
      - msq-relayer-network

  oz-relayer-2:
    image: ghcr.io/openzeppelin/openzeppelin-relayer:v1.3.0
    container_name: msq-oz-relayer-2-prod
    volumes:
      - ./keys/relayer-2:/app/config/keys/relayer-2:ro
      - ./config/oz-relayer/relayer-2.json:/app/config/config.json:ro
    environment:
      - RUST_LOG=info
      - RELAY_API_KEY=${RELAY_API_KEY}
      - KEYSTORE_PASSPHRASE=${KEYSTORE_PASSPHRASE}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - RPC_URL=${RPC_URL}
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/v1/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
    networks:
      - msq-relayer-network

  oz-relayer-3:
    image: ghcr.io/openzeppelin/openzeppelin-relayer:v1.3.0
    container_name: msq-oz-relayer-3-prod
    volumes:
      - ./keys/relayer-3:/app/config/keys/relayer-3:ro
      - ./config/oz-relayer/relayer-3.json:/app/config/config.json:ro
    environment:
      - RUST_LOG=info
      - RELAY_API_KEY=${RELAY_API_KEY}
      - KEYSTORE_PASSPHRASE=${KEYSTORE_PASSPHRASE}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - RPC_URL=${RPC_URL}
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/v1/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
    networks:
      - msq-relayer-network

volumes:
  msq-relayer-redis-data:
    driver: local

networks:
  msq-relayer-network:
    driver: bridge
```

**검증:**
- 프로덕션 환경 시작: `docker-compose -f docker/docker-compose.prod.yml up -d`
- relay-api-1, relay-api-2 모두 시작 확인
- Health Check 통과 확인

---

### 2.2 프로덕션 최적화

**환경 변수 검증:**
- 필수 환경 변수 누락 시 에러 로그 출력 및 종료
- `main.ts`에 검증 로직 추가

**로그 로테이션:**
- `logging` 지시자 설정
- 최대 로그 크기: 10MB
- 최대 로그 파일 수: 3개

**보안 설정:**
- 프로덕션 환경에서 개발 모드 환경 변수 사용 금지
- Swagger UI 접근 제한 (내부 네트워크만)

**검증:**
- 환경 변수 누락 시 서비스 시작 실패 확인
- 로그 파일 크기 및 개수 제한 동작 확인

---

## Phase 3: 환경별 설정 파일 (우선순위: Medium)

### 3.1 환경 파일 생성

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

## Phase 4: Deployment Makefile (우선순위: Medium)

### 4.1 Makefile 타겟 정의

**파일 위치:**
- 프로젝트 루트에 `Makefile` 생성

**Makefile 내용:**
```makefile
.PHONY: prod-up prod-down api-docs health-check generate-client

# 프로덕션 환경 시작
prod-up:
	@echo "Starting production environment..."
	cd docker && docker-compose -f docker-compose.prod.yml up -d
	@echo "Production environment started."
	@echo "Swagger UI: http://localhost:3001/api/docs"
	@echo "Swagger UI: http://localhost:3002/api/docs"

# 프로덕션 환경 종료
prod-down:
	@echo "Stopping production environment..."
	cd docker && docker-compose -f docker-compose.prod.yml down
	@echo "Production environment stopped."

# OpenAPI JSON 추출
api-docs:
	@echo "Extracting OpenAPI JSON..."
	curl -o openapi.json http://localhost:3001/api/docs-json
	@echo "OpenAPI JSON saved to openapi.json"

# 서비스 상태 확인
health-check:
	@echo "Checking service health..."
	@echo "relay-api-1:"
	@curl -s http://localhost:3001/api/v1/health | jq || echo "Failed"
	@echo "relay-api-2:"
	@curl -s http://localhost:3002/api/v1/health | jq || echo "Failed"

# TypeScript Client SDK 생성 (선택 사항)
generate-client:
	@echo "Generating TypeScript Client SDK..."
	npx @openapitools/openapi-generator-cli generate \
		-i openapi.json \
		-g typescript-axios \
		-o ./generated/client
	@echo "Client SDK generated in ./generated/client"
```

**검증:**
- `make prod-up` 실행 및 서비스 시작 확인
- `make prod-down` 실행 및 서비스 종료 확인
- `make api-docs` 실행 및 `openapi.json` 생성 확인
- `make health-check` 실행 및 상태 출력 확인

---

## Phase 5: Operations Guide (우선순위: Medium)

### 5.1 docs/operations.md 작성

**파일 위치:**
- `docs/operations.md`

**문서 구조:**

#### 1. 서비스 시작/중지 절차

**서비스 시작:**
```bash
# 프로덕션 환경 시작
make prod-up

# 또는
cd docker
docker-compose -f docker-compose.prod.yml up -d
```

**서비스 중지:**
```bash
# 프로덕션 환경 중지
make prod-down

# 또는
cd docker
docker-compose -f docker-compose.prod.yml down
```

**서비스 상태 확인:**
```bash
# Health Check
make health-check

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

| Phase | 우선순위 | 예상 시간 | 의존성 |
|-------|---------|----------|--------|
| Phase 1: Swagger/OpenAPI 통합 | High | 2-3시간 | None |
| Phase 2: Production Docker Compose | High | 2-3시간 | SPEC-INFRA-001 |
| Phase 3: 환경별 설정 파일 | Medium | 1시간 | None |
| Phase 4: Deployment Makefile | Medium | 1시간 | Phase 2 |
| Phase 5: Operations Guide | Medium | 2시간 | Phase 1, 2, 4 |

**총 예상 시간:** 8-10시간

---

## 리스크 및 대응 방안

### 리스크 1: Swagger UI 접근 제한 설정 누락
- **영향:** 외부에서 API 문서 노출
- **대응:** Swagger UI는 내부 네트워크에서만 접근 가능하도록 설정 또는 API Key 인증 추가

### 리스크 2: 환경 변수 파일 Git 커밋
- **영향:** 프로덕션 API Key 유출
- **대응:** `.gitignore`에 명시적으로 추가, Pre-commit Hook 설정 (선택 사항)

### 리스크 3: Health Check 실패 시 무한 재시작
- **영향:** 리소스 낭비
- **대응:** `start_period` 30초 설정하여 초기화 시간 확보, 재시작 횟수 제한

---

## 다음 단계

1. **Phase 1 시작:** Swagger/OpenAPI 통합 우선 구현
2. **Phase 2 진행:** Production Docker Compose 작성
3. **검증:** 각 Phase 완료 시 acceptance.md의 시나리오로 검증
4. **문서화:** 모든 Phase 완료 후 README.md 업데이트

---

**마지막 업데이트:** 2024-12-25
**작성자:** @user
**SPEC 버전:** 1.0.0
