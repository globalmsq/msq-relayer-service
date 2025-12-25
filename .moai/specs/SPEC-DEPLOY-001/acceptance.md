# SPEC-DEPLOY-001 인수 기준 (Acceptance Criteria)

## 개요

이 문서는 SPEC-DEPLOY-001(프로덕션 배포 환경 설정, API 문서화 및 운영 가이드)의 완료 여부를 검증하기 위한 인수 기준을 정의합니다.

**검증 방법:** Given-When-Then 형식의 시나리오 기반 테스트

**검증 환경:**
- 로컬 개발 환경 (Docker Desktop)
- 프로덕션 유사 환경 (docker-compose.prod.yml)

---

## 시나리오 1: Swagger UI 접근 및 API 문서 검증

### Given (사전 조건)
- relay-api 서비스가 정상적으로 실행 중
- 포트 3000(개발) 또는 3001/3002(프로덕션)이 열려 있음

### When (실행 동작)
1. 웹 브라우저에서 `http://localhost:3000/api/docs` 접근 (개발 환경)
2. 또는 `http://localhost:3001/api/docs` 접근 (프로덕션 환경)

### Then (예상 결과)
1. **Swagger UI가 정상적으로 표시됨**
   - 페이지 제목: "MSQ Relayer Service API"
   - 버전 정보: "1.0.0"

2. **모든 API 엔드포인트가 문서화되어 있음**
   - `/api/v1/health` (Health Check)
   - `/api/v1/relay` (Direct TX)
   - `/api/v1/gasless` (Gasless TX)
   - `/api/v1/status/{txId}` (TX Status)
   - 기타 모든 구현된 엔드포인트

3. **각 엔드포인트에 다음 정보가 포함됨**
   - Summary (요약)
   - Description (상세 설명)
   - Request Body Schema (요청 스키마)
   - Response Schema (응답 스키마)
   - Example Values (예제 값)

4. **API Key 인증 UI가 활성화됨**
   - Swagger UI 상단에 "Authorize" 버튼 표시
   - 클릭 시 `x-api-key` 입력 필드 표시

### 검증 명령
```bash
# Swagger UI 접근 가능 여부 확인
curl -I http://localhost:3000/api/docs

# 예상 결과: HTTP/1.1 200 OK
```

---

## 시나리오 2: OpenAPI JSON 다운로드 및 스키마 검증

### Given (사전 조건)
- relay-api 서비스가 정상적으로 실행 중
- Swagger UI가 정상적으로 작동 중

### When (실행 동작)
1. `http://localhost:3000/api/docs-json` 접근
2. 또는 Makefile 타겟 실행: `make api-docs`

### Then (예상 결과)
1. **OpenAPI JSON이 다운로드됨**
   - Content-Type: `application/json`
   - 파일 크기: > 0 bytes

2. **유효한 OpenAPI 3.0 스키마**
   - `openapi: "3.0.0"` 필드 존재
   - `info.title: "MSQ Relayer Service API"` 존재
   - `info.version: "1.0.0"` 존재
   - `paths` 객체에 모든 엔드포인트 정의됨

3. **스키마 검증 통과**
   - OpenAPI 3.0 스펙 준수
   - 필수 필드 모두 존재
   - 스키마 구조 유효성 검증 통과

### 검증 명령
```bash
# OpenAPI JSON 다운로드
curl -o openapi.json http://localhost:3000/api/docs-json

# JSON 파일 유효성 검증
jq . openapi.json > /dev/null && echo "Valid JSON" || echo "Invalid JSON"

# OpenAPI 버전 확인
jq '.openapi' openapi.json
# 예상 결과: "3.0.0"

# API 제목 확인
jq '.info.title' openapi.json
# 예상 결과: "MSQ Relayer Service API"

# 엔드포인트 목록 확인
jq '.paths | keys' openapi.json
# 예상 결과: ["/api/v1/health", "/api/v1/relay", ...]
```

---

## 시나리오 3: 프로덕션 배포 환경 검증

### Given (사전 조건)
- Docker Compose 설치 (2.20.0+)
- `docker/docker-compose.prod.yml` 파일 존재
- `.env.production` 파일 존재 (필수 환경 변수 설정됨)

### When (실행 동작)
1. 프로덕션 환경 시작: `make prod-up`
2. 또는: `cd docker && docker-compose -f docker-compose.prod.yml up -d`

### Then (예상 결과)
1. **모든 서비스가 정상적으로 시작됨**
   - `msq-relay-api-1`: 실행 중 (포트 3001)
   - `msq-relay-api-2`: 실행 중 (포트 3002)
   - `msq-redis-prod`: 실행 중 (포트 6379)
   - `msq-oz-relayer-1-prod`: 실행 중
   - `msq-oz-relayer-2-prod`: 실행 중
   - `msq-oz-relayer-3-prod`: 실행 중

2. **Health Check가 통과됨**
   - relay-api-1: `http://localhost:3001/api/v1/health` → 200 OK
   - relay-api-2: `http://localhost:3002/api/v1/health` → 200 OK

3. **리소스 제한이 적용됨**
   - relay-api: CPU 1.0 core, Memory 512MB
   - OZ Relayer: CPU 0.5 core, Memory 256MB
   - Redis: CPU 0.3 core, Memory 128MB

4. **로그 로테이션이 설정됨**
   - 최대 로그 크기: 10MB
   - 최대 로그 파일 수: 3개

### 검증 명령
```bash
# 프로덕션 환경 시작
make prod-up

# 서비스 상태 확인
docker ps | grep msq-relay-api
# 예상 결과: msq-relay-api-1, msq-relay-api-2 실행 중

# Health Check 확인
curl http://localhost:3001/api/v1/health
curl http://localhost:3002/api/v1/health
# 예상 결과: {"status":"ok", ...}

# 또는 Makefile 타겟 사용
make health-check

# 리소스 제한 확인
docker inspect msq-relay-api-1 | jq '.[0].HostConfig.NanoCpus'
# 예상 결과: 1000000000 (1.0 CPU)

docker inspect msq-relay-api-1 | jq '.[0].HostConfig.Memory'
# 예상 결과: 536870912 (512MB)

# 로그 로테이션 확인
docker inspect msq-relay-api-1 | jq '.[0].HostConfig.LogConfig'
# 예상 결과: {"Type":"json-file","Config":{"max-file":"3","max-size":"10m"}}
```

---

## 시나리오 4: 환경별 설정 파일 검증

### Given (사전 조건)
- 환경별 설정 파일이 생성됨
  - `.env.development`
  - `.env.staging`
  - `.env.production`
  - `.env.example`

### When (실행 동작)
1. `.env.example` 파일을 `.env.production`으로 복사
2. 필수 환경 변수 값 설정
3. 프로덕션 환경 시작: `make prod-up`

### Then (예상 결과)
1. **`.env.example`이 Git에 포함됨**
   - `git ls-files .env.example` → 파일 존재

2. **민감 정보 파일이 Git에서 제외됨**
   - `git ls-files .env.production` → 파일 없음
   - `.gitignore`에 `.env.production` 추가됨

3. **환경 변수가 올바르게 로드됨**
   - `NODE_ENV=production`
   - `RELAY_API_KEY`가 설정됨
   - `RPC_URL`이 설정됨

4. **필수 환경 변수 누락 시 서비스 시작 실패**
   - `RELAY_API_KEY` 누락 시 에러 로그 출력
   - 서비스가 시작되지 않음

### 검증 명령
```bash
# .env.example이 Git에 포함되는지 확인
git ls-files .env.example
# 예상 결과: .env.example

# .env.production이 Git에서 제외되는지 확인
git ls-files .env.production
# 예상 결과: (출력 없음)

# .gitignore 확인
grep ".env.production" .gitignore
# 예상 결과: .env.production

# 환경 변수 로드 확인 (서비스 실행 중)
docker exec msq-relay-api-1 printenv NODE_ENV
# 예상 결과: production

docker exec msq-relay-api-1 printenv RELAY_API_KEY
# 예상 결과: (설정한 API Key 값)

# 필수 환경 변수 누락 시 시작 실패 확인 (테스트)
# 1. .env.production에서 RELAY_API_KEY 제거
# 2. make prod-up 실행
# 3. 에러 로그 확인
# 예상 결과: "RELAY_API_KEY is required" 에러 출력
```

---

## 시나리오 5: Makefile 타겟 실행 검증

### Given (사전 조건)
- `Makefile`이 프로젝트 루트에 생성됨
- 프로덕션 환경이 실행 중 (일부 타겟 테스트용)

### When (실행 동작)
1. `make prod-up` 실행
2. `make health-check` 실행
3. `make api-docs` 실행
4. `make prod-down` 실행

### Then (예상 결과)
1. **`make prod-up`**
   - 프로덕션 환경이 시작됨
   - 성공 메시지 출력: "Production environment started."
   - Swagger UI 접근 URL 출력

2. **`make health-check`**
   - relay-api-1, relay-api-2의 Health Check 결과 출력
   - 상태: "ok"

3. **`make api-docs`**
   - `openapi.json` 파일이 생성됨
   - 성공 메시지 출력: "OpenAPI JSON saved to openapi.json"

4. **`make prod-down`**
   - 프로덕션 환경이 종료됨
   - 성공 메시지 출력: "Production environment stopped."

### 검증 명령
```bash
# make prod-up 실행
make prod-up
# 예상 출력:
# Starting production environment...
# Production environment started.
# Swagger UI: http://localhost:3001/api/docs
# Swagger UI: http://localhost:3002/api/docs

# make health-check 실행
make health-check
# 예상 출력:
# Checking service health...
# relay-api-1:
# {"status":"ok", ...}
# relay-api-2:
# {"status":"ok", ...}

# make api-docs 실행
make api-docs
# 예상 출력:
# Extracting OpenAPI JSON...
# OpenAPI JSON saved to openapi.json

# openapi.json 파일 존재 확인
ls -lh openapi.json
# 예상 결과: 파일 존재, 크기 > 0 bytes

# make prod-down 실행
make prod-down
# 예상 출력:
# Stopping production environment...
# Production environment stopped.

# 서비스 종료 확인
docker ps | grep msq-relay-api
# 예상 결과: (출력 없음)
```

---

## 시나리오 6: Operations Guide 문서 접근성 검증

### Given (사전 조건)
- `docs/operations.md` 파일이 생성됨
- 신규 인력이 문서를 참조하여 서비스 운영을 수행한다고 가정

### When (실행 동작)
1. `docs/operations.md` 파일 열기
2. 문서에 명시된 절차대로 서비스 시작
3. 문서에 명시된 절차대로 API 문서 접근
4. 문서에 명시된 절차대로 트러블슈팅 수행

### Then (예상 결과)
1. **서비스 시작/중지 절차가 명확히 기술됨**
   - `make prod-up` 명령어 명시
   - 또는 `docker-compose -f docker-compose.prod.yml up -d` 명시
   - 예상 결과 및 확인 방법 기술

2. **API 문서 접근 방법이 명확히 기술됨**
   - Swagger UI URL: `http://localhost:3001/api/docs`
   - OpenAPI JSON URL: `http://localhost:3001/api/docs-json`
   - API Key 인증 방법 기술

3. **Client SDK 생성 가이드가 포함됨**
   - `make api-docs` 명령어 명시
   - `make generate-client` 명령어 명시 (선택 사항)
   - 생성된 SDK 사용 예제 코드 포함

4. **트러블슈팅 시나리오가 포함됨**
   - 시나리오 1: Health Check 실패
   - 시나리오 2: 환경 변수 누락
   - 시나리오 3: 포트 충돌
   - 각 시나리오별 증상, 원인, 해결 방법 기술

### 검증 명령
```bash
# operations.md 파일 존재 확인
ls -lh docs/operations.md
# 예상 결과: 파일 존재

# 문서 내용 확인
cat docs/operations.md | grep "서비스 시작"
# 예상 결과: 서비스 시작 절차 섹션 존재

cat docs/operations.md | grep "API 문서 접근"
# 예상 결과: API 문서 접근 방법 섹션 존재

cat docs/operations.md | grep "Client SDK"
# 예상 결과: Client SDK 생성 가이드 섹션 존재

cat docs/operations.md | grep "트러블슈팅"
# 예상 결과: 트러블슈팅 시나리오 섹션 존재

# 신규 인력 온보딩 시뮬레이션 (수동 검증)
# 1. operations.md 문서만 보고 서비스 시작 가능한지 확인
# 2. operations.md 문서만 보고 API 문서 접근 가능한지 확인
# 3. operations.md 문서만 보고 트러블슈팅 수행 가능한지 확인
```

---

## 시나리오 7: TypeScript Client SDK 생성 검증 (선택 사항)

### Given (사전 조건)
- `openapi.json` 파일이 생성됨 (`make api-docs` 실행 완료)
- OpenAPI Generator CLI 설치 가능

### When (실행 동작)
1. `make generate-client` 실행

### Then (예상 결과)
1. **TypeScript Client SDK가 생성됨**
   - 출력 디렉토리: `./generated/client`
   - 생성된 파일: `api.ts`, `base.ts`, `configuration.ts`, etc.

2. **생성된 SDK가 사용 가능함**
   - TypeScript 컴파일 통과
   - API 호출 코드 작성 가능

### 검증 명령
```bash
# Client SDK 생성
make generate-client
# 예상 출력:
# Generating TypeScript Client SDK...
# Client SDK generated in ./generated/client

# 생성된 파일 확인
ls -lh ./generated/client
# 예상 결과: api.ts, base.ts, configuration.ts 등 파일 존재

# TypeScript 컴파일 확인 (선택 사항)
cd ./generated/client
npm install
npx tsc --noEmit
# 예상 결과: 컴파일 에러 없음
```

---

## 전체 인수 체크리스트

### Swagger/OpenAPI 통합
- [ ] Swagger UI 접근 가능 (`http://localhost:3000/api/docs`)
- [ ] 모든 API 엔드포인트 문서화 완료
- [ ] OpenAPI JSON 다운로드 가능 (`http://localhost:3000/api/docs-json`)
- [ ] OpenAPI 3.0 스키마 검증 통과
- [ ] API Key 인증 UI 활성화

### 프로덕션 Docker Compose
- [ ] docker-compose.prod.yml 작성 완료
- [ ] relay-api 2개 replica 시작 성공 (포트 3001, 3002)
- [ ] Health Check 통과
- [ ] 리소스 제한 적용 확인 (CPU, Memory)
- [ ] 로그 로테이션 설정 확인

### 환경별 설정 파일
- [ ] .env.development 생성
- [ ] .env.staging 생성
- [ ] .env.production 생성
- [ ] .env.example 생성 및 Git 포함
- [ ] .gitignore에 민감 정보 파일 추가

### Deployment Makefile
- [ ] Makefile 생성
- [ ] `make prod-up` 타겟 동작 확인
- [ ] `make prod-down` 타겟 동작 확인
- [ ] `make api-docs` 타겟 동작 확인
- [ ] `make health-check` 타겟 동작 확인

### Operations Guide
- [ ] docs/operations.md 생성
- [ ] 서비스 시작/중지 절차 기술
- [ ] API 문서 접근 방법 기술
- [ ] Client SDK 생성 가이드 기술
- [ ] 트러블슈팅 시나리오 기술

### 선택 사항
- [ ] TypeScript Client SDK 생성 성공 (`make generate-client`)
- [ ] Swagger UI Try it out 기능 활성화
- [ ] 트러블슈팅 시나리오 추가 (3개 이상)

---

## 인수 기준 통과 조건

**필수 조건 (5개 시나리오 모두 통과):**
1. ✅ 시나리오 1: Swagger UI 접근 및 API 문서 검증
2. ✅ 시나리오 2: OpenAPI JSON 다운로드 및 스키마 검증
3. ✅ 시나리오 3: 프로덕션 배포 환경 검증
4. ✅ 시나리오 4: 환경별 설정 파일 검증
5. ✅ 시나리오 6: Operations Guide 문서 접근성 검증

**권장 조건 (선택 사항):**
6. ⭕ 시나리오 5: Makefile 타겟 실행 검증
7. ⭕ 시나리오 7: TypeScript Client SDK 생성 검증

**최종 인수:** 필수 조건 5개 모두 통과 시 SPEC-DEPLOY-001 완료로 간주

---

**마지막 업데이트:** 2024-12-25
**작성자:** @user
**SPEC 버전:** 1.0.0
