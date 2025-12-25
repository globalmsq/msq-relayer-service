# MSQ Relayer Service - Operations Guide

## 개요

이 문서는 MSQ Relayer Service를 프로덕션 환경에서 운영하기 위한 절차를 설명합니다.

**주요 내용**:
- 서비스 시작/중지 절차
- API 문서 접근 방법
- Client SDK 생성 가이드
- 모니터링 및 트러블슈팅

---

## 1. 서비스 시작/중지 절차

### 프로덕션 환경 시작

```bash
# Makefile 사용 (권장)
make prod-up

# 또는 Docker Compose 직접 사용
cd docker
docker-compose -f docker-compose.prod.yml up -d
```

**시작 시 확인 사항**:
1. 환경 변수 설정 확인
   ```bash
   cat .env.production
   ```
   필수 환경 변수: `RELAY_API_KEY`, `RPC_URL`, `KEYSTORE_PASSPHRASE`

2. 서비스 상태 확인
   ```bash
   make health-check
   ```
   예상 결과: 모든 서비스 `healthy` 상태

**시작된 서비스**:
- `msq-relay-api-1` (포트 3001)
- `msq-relay-api-2` (포트 3002)
- `msq-oz-relayer-1-prod`
- `msq-oz-relayer-2-prod`
- `msq-oz-relayer-3-prod`
- `msq-redis-prod` (포트 6379)

### 프로덕션 환경 중지

```bash
# Makefile 사용 (권장)
make prod-down

# 또는 Docker Compose 직접 사용
cd docker
docker-compose -f docker-compose.prod.yml down
```

### 서비스 상태 확인

```bash
# Makefile 사용
make health-check

# 또는 curl 직접 사용
curl http://localhost:3001/api/v1/health | jq
curl http://localhost:3002/api/v1/health | jq
```

**예상 응답**:
```json
{
  "status": "ok",
  "info": {
    "oz-relayer-pool": {
      "status": "healthy",
      "healthyCount": 3,
      "totalCount": 3
    },
    "redis": {
      "status": "healthy"
    }
  }
}
```

---

## 2. API 문서 접근 방법

### Swagger UI

브라우저에서 다음 URL로 API 문서에 접근합니다:

**개발 환경**:
```
http://localhost:3000/api/docs
```

**프로덕션 환경**:
```
http://localhost:3001/api/docs
http://localhost:3002/api/docs
```

### OpenAPI JSON

OpenAPI 3.0 형식의 API 스펙을 다운로드합니다:

**개발 환경**:
```bash
curl http://localhost:3000/api/docs-json > openapi.json
```

**프로덕션 환경**:
```bash
# Makefile 사용 (권장)
make api-docs

# 또는 curl 직접 사용
curl http://localhost:3001/api/docs-json > openapi.json
```

### API Key 인증

1. **Swagger UI에서 인증 활성화**:
   - Swagger UI 상단의 "Authorize" 버튼 클릭
   - `x-api-key` 입력 필드에 API Key 입력
   - "Authorize" 클릭하여 인증 활성화

2. **curl에서 API Key 사용**:
   ```bash
   curl -H "x-api-key: your-api-key-here" http://localhost:3001/api/v1/health
   ```

3. **TypeScript/JavaScript에서 API Key 사용**:
   ```typescript
   const headers = {
     'x-api-key': 'your-api-key-here',
     'Content-Type': 'application/json'
   };

   const response = await fetch('http://localhost:3001/api/v1/health', {
     method: 'GET',
     headers
   });
   ```

---

## 3. Client SDK 생성 가이드

### 전제 조건

- OpenAPI Generator CLI 설치
- OpenAPI JSON 파일 (`openapi.json`)

### Step 1: OpenAPI JSON 추출

```bash
make api-docs
```

이 명령어가 `openapi.json` 파일을 생성합니다.

### Step 2: TypeScript Client SDK 생성

```bash
make generate-client
```

또는 수동으로:

```bash
npx @openapitools/openapi-generator-cli generate \
  -i openapi.json \
  -g typescript-axios \
  -o ./generated/client
```

### Step 3: 생성된 SDK 사용

생성된 SDK는 `./generated/client` 디렉토리에 위치합니다.

```typescript
import { DefaultApi } from './generated/client';

// API 클라이언트 초기화
const api = new DefaultApi({
  basePath: 'http://localhost:3001',
  headers: {
    'x-api-key': 'your-api-key-here'
  }
});

// Direct Transaction API 호출
const response = await api.sendDirectTransaction({
  to: '0x1234567890123456789012345678901234567890',
  data: '0xabcdef',
  value: '1000000000000000000'
});

console.log(response.data);
```

### Step 4: 프로젝트에 SDK 통합

생성된 SDK를 프로젝트에 복사하여 사용합니다:

```bash
# 또는 package로 배포
cp -r ./generated/client ./packages/sdk
npm install ./packages/sdk
```

---

## 4. 모니터링 및 트러블슈팅

### 로그 확인

각 서비스의 로그를 확인합니다:

```bash
# relay-api-1 로그
docker logs msq-relay-api-1

# relay-api-2 로그
docker logs msq-relay-api-2

# 실시간 로그 추적
docker logs -f msq-relay-api-1

# OZ Relayer 로그
docker logs msq-oz-relayer-1-prod
```

### 서비스 상태 확인

```bash
# 모든 컨테이너 상태 확인
docker ps | grep msq-

# 특정 컨테이너의 상세 정보
docker inspect msq-relay-api-1
```

### 일반적인 트러블슈팅 시나리오

#### 시나리오 1: Health Check 실패

**증상**: `/api/v1/health` 엔드포인트가 503 Service Unavailable 반환

**원인**: Redis 또는 OZ Relayer 연결 실패

**해결 방법**:

1. Redis 상태 확인
   ```bash
   docker logs msq-redis-prod
   docker exec msq-redis-prod redis-cli ping
   ```
   예상 응답: `PONG`

2. OZ Relayer 상태 확인
   ```bash
   docker logs msq-oz-relayer-1-prod
   docker exec msq-oz-relayer-1-prod curl http://localhost:8080/api/v1/health
   ```

3. 서비스 재시작
   ```bash
   # 문제가 있는 서비스만 재시작
   docker-compose -f docker/docker-compose.prod.yml restart msq-relay-api-1

   # 전체 환경 재시작
   make prod-down && make prod-up
   ```

#### 시나리오 2: 환경 변수 누락

**증상**: 서비스 시작 시 다음 에러 메시지 출력:
```
[ERROR] Missing required environment variables: RELAY_API_KEY, NODE_ENV
```

**원인**: `.env.production` 파일에 필수 환경 변수가 설정되지 않음

**해결 방법**:

1. 환경 변수 파일 확인
   ```bash
   cat .env.production
   ```

2. 누락된 환경 변수 추가
   ```bash
   # .env.production 편집
   nano .env.production

   # 필수 환경 변수:
   # NODE_ENV=production
   # PORT=3000
   # RELAY_API_KEY=your-api-key
   # REDIS_HOST=redis
   # REDIS_PORT=6379
   # RPC_URL=your-rpc-url
   ```

3. 서비스 재시작
   ```bash
   make prod-up
   ```

#### 시나리오 3: 포트 충돌

**증상**: 서비스 시작 시 다음 에러 메시지 출력:
```
Error response from daemon: bind: address already in use
```

**원인**: 3001, 3002 또는 6379 포트가 이미 사용 중

**해결 방법**:

1. 포트 사용 중인 프로세스 확인
   ```bash
   # macOS/Linux
   lsof -i :3001
   lsof -i :3002
   lsof -i :6379

   # Windows
   netstat -ano | findstr :3001
   ```

2. 포트를 사용하는 프로세스 종료
   ```bash
   # macOS/Linux
   kill -9 <PID>

   # 또는 Docker 프로세스 종료
   docker-compose -f docker/docker-compose.yaml down
   ```

3. 서비스 시작
   ```bash
   make prod-up
   ```

#### 시나리오 4: 컨테이너 빌드 실패

**증상**: `docker-compose.prod.yml up` 시 빌드 에러

**해결 방법**:

```bash
# 기존 이미지 제거
docker-compose -f docker/docker-compose.prod.yml down -v

# 이미지 재빌드
docker-compose -f docker/docker-compose.prod.yml up --build -d
```

### 성능 모니터링

```bash
# CPU 및 메모리 사용량 확인
docker stats msq-relay-api-1 msq-relay-api-2 msq-redis-prod

# 컨테이너 리소스 제한 확인
docker inspect msq-relay-api-1 | jq '.[0].HostConfig.NanoCpus'
docker inspect msq-relay-api-1 | jq '.[0].HostConfig.Memory'
```

### 로그 로테이션 확인

```bash
# 로그 설정 확인
docker inspect msq-relay-api-1 | jq '.[0].HostConfig.LogConfig'

# 예상 결과:
# {
#   "Type": "json-file",
#   "Config": {
#     "max-file": "3",
#     "max-size": "10m"
#   }
# }
```

---

## 5. 비상 절차

### 긴급 재시작

```bash
# 전체 서비스 강제 재시작
make prod-down
make prod-up
```

### 데이터 초기화

```bash
# Redis 데이터 초기화 (주의: 데이터 손실)
docker exec msq-redis-prod redis-cli FLUSHALL

# 또는 볼륨 삭제하고 재시작
docker-compose -f docker/docker-compose.prod.yml down -v
make prod-up
```

### 로그 정리

```bash
# 컨테이너 로그 삭제
docker logs --tail 0 -f msq-relay-api-1

# 또는 직접 로그 파일 관리
docker inspect msq-relay-api-1 | jq '.[] | .LogPath'
```

---

## 6. 신규 인력 온보딩 체크리스트

신규 팀원이 서비스를 운영하기 위해 다음을 확인합니다:

- [ ] 이 문서를 읽었는가
- [ ] Docker Desktop이 설치되어 있는가
- [ ] `.env.production` 파일이 설정되어 있는가
- [ ] `make prod-up` 명령어로 서비스를 시작할 수 있는가
- [ ] `make health-check` 명령어로 서비스 상태를 확인할 수 있는가
- [ ] `http://localhost:3001/api/docs`에서 Swagger UI에 접근할 수 있는가
- [ ] `make api-docs` 명령어로 OpenAPI JSON을 추출할 수 있는가
- [ ] 일반적인 트러블슈팅 시나리오 해결 방법을 숙지했는가

---

## 7. 추가 리소스

- **[README.md](../README.md)** - 프로젝트 개요
- **[SPEC-DEPLOY-001](../.moai/specs/SPEC-DEPLOY-001/spec.md)** - 배포 SPEC
- **[Swagger UI](http://localhost:3001/api/docs)** - API 문서
- **[OpenAPI JSON](http://localhost:3001/api/docs-json)** - OpenAPI 3.0 스펙

---

**마지막 업데이트**: 2024-12-25
**작성자**: core-planner
