---
id: SPEC-DEPLOY-001
version: "1.0.0"
status: "draft"
created: "2024-12-25"
updated: "2024-12-25"
author: "@user"
priority: "medium"
---

## HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0.0 | 2024-12-25 | @user | 사용자 피드백 반영: Makefile 및 docker-compose.prod.yml 제거, Swagger/OpenAPI와 운영 가이드 중심으로 재편성 |
| 1.0.0 | 2024-12-25 | @user | Task #12 기반 초기 SPEC 생성 - 프로덕션 환경 설정, API 문서화, 운영 가이드 |

# SPEC-DEPLOY-001: API 문서화 및 운영 가이드

## 개요

MSQ Relayer Service의 API 문서화 및 운영을 위한 통합 SPEC입니다. 이 SPEC은 Task #12의 요구사항을 기반으로 다음 두 가지 핵심 영역을 다룹니다:

1. **API 문서화**: Swagger/OpenAPI 3.0 기반 자동 문서 생성 및 Client SDK 지원
2. **운영 가이드**: 개발/운영 환경 설정, 서비스 관리 절차, 모니터링, 트러블슈팅

**배경:**
- 기존 SPEC-INFRA-001에서 로컬 개발 환경(docker-compose.yaml) 구축 완료
- Task #11 완료로 통합 테스트 인프라 준비 완료
- 프로덕션 환경 배포 및 클라이언트 서비스 통합을 위한 API 문서화 필요

**목표:**
- Client Services가 Swagger UI(/api/docs)를 통해 API 학습 및 통합
- OpenAPI JSON(/api/docs-json)에서 TypeScript Client SDK 자동 생성
- 프로덕션 환경에서 안정적인 2-replica 배포 운영
- 신규 인력 온보딩 시 운영 가이드 참조 가능

---

## EARS 요구사항

### Ubiquitous Requirements (항상 적용되는 요구사항)

**U-DEPLOY-001**: 시스템은 모든 API 엔드포인트에 대해 Swagger 문서화를 필수로 제공해야 합니다.
- 모든 컨트롤러에 `@ApiOperation` 데코레이터 필수
- 모든 HTTP 응답에 `@ApiResponse` 데코레이터 필수
- 모든 DTO에 `@ApiProperty` 및 예제 값 필수

**U-DEPLOY-002**: 시스템은 환경별 설정을 `.env.{environment}` 파일 형식으로 관리해야 합니다.
- `.env.development`: 로컬 개발 환경
- `.env.staging`: 스테이징 환경
- `.env.production`: 프로덕션 환경
- `.env.example`: 템플릿 (Git 포함)

**U-DEPLOY-003**: 시스템은 API 문서에 API Key 인증 방식을 명시해야 합니다.
- Swagger UI에서 API Key 입력 UI 제공
- `x-api-key` 헤더 사용 방식 문서화

**U-DEPLOY-004**: 시스템은 모든 환경 설정 파일에서 민감 정보를 제외하고 `.env.example`만 Git에 포함해야 합니다.
- `.env.development`, `.env.staging`, `.env.production`은 `.gitignore` 추가

### Event-driven Requirements (이벤트 기반 요구사항)

**E-DEPLOY-001**: Swagger UI 접근 시(`/api/docs`), 시스템은 최신 API 스펙을 표시해야 합니다.
- 서비스 시작 시 SwaggerModule 자동 초기화
- 코드 변경 시 문서 자동 반영

**E-DEPLOY-002**: OpenAPI JSON 요청 시(`/api/docs-json`), 시스템은 유효한 OpenAPI 3.0 스키마를 다운로드 제공해야 합니다.
- Content-Type: `application/json`
- 스키마 검증 통과 필수

**E-DEPLOY-003**: 서비스 시작 시, 시스템은 환경 변수 검증을 수행한 후 서비스를 시작해야 합니다.
- 필수 환경 변수 누락 시 에러 로그 출력 및 종료
- 검증 통과 후 서비스 시작

### State-driven Requirements (상태 기반 요구사항)

**S-DEPLOY-001**: API 문서화가 완료되어 실행 중일 때, 시스템은 최신 문서를 제공해야 합니다.
- Swagger UI와 OpenAPI JSON이 일관된 정보 유지
- 코드 변경 시 문서 자동 반영

### Unwanted Behavior (금지된 동작)

**UW-DEPLOY-001**: 시스템은 `.env.production` 파일을 Git 저장소에 커밋해서는 안 됩니다.
- `.gitignore`에 명시적으로 추가

**UW-DEPLOY-002**: 시스템은 프로덕션 환경에서 개발 모드 환경 변수(예: `DEV_MODE=true`)를 사용해서는 안 됩니다.

**UW-DEPLOY-003**: 시스템은 Swagger UI를 외부 인증 없이 노출해서는 안 됩니다.
- 내부 네트워크에서만 접근 가능하도록 설정
- 또는 API Key 인증 추가

**UW-DEPLOY-004**: 시스템은 API 문서화 없이 새로운 엔드포인트를 추가해서는 안 됩니다.
- CI/CD에서 문서화 검증 추가 (선택 사항)

### Optional Requirements (선택적 요구사항)

**O-DEPLOY-001**: 가능하다면, OpenAPI Generator를 사용하여 TypeScript Client SDK를 자동 생성할 수 있어야 합니다.
- `make generate-client` 타겟 추가 (선택 사항)

**O-DEPLOY-002**: 가능하다면, Swagger UI에 Try it out 기능을 활성화하여 API 테스트를 지원할 수 있어야 합니다.

**O-DEPLOY-003**: 가능하다면, 운영 가이드에 일반적인 트러블슈팅 시나리오 및 해결 방법을 포함할 수 있어야 합니다.

---

## 기술 스택

### NestJS Swagger 통합

**라이브러리:**
- `@nestjs/swagger`: 7.4.2 (현재 설치됨)
- `swagger-ui-express`: 자동 포함

**설정 위치:**
- `packages/relay-api/src/main.ts`: SwaggerModule 초기화

**문서 엔드포인트:**
- Swagger UI: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs-json`

### 환경별 설정 파일

**파일 구조:**
```
.env.development      # 로컬 개발 환경
.env.staging          # 스테이징 환경
.env.production       # 프로덕션 환경
.env.example          # 템플릿 (Git 포함)
```

**필수 환경 변수:**
- `NODE_ENV`: development | staging | production
- `PORT`: API Gateway 포트 (3000)
- `RELAY_API_KEY`: API 인증 키
- `REDIS_HOST`: Redis 호스트
- `REDIS_PORT`: Redis 포트
- `RPC_URL`: 블록체인 RPC URL

---

## 의존성

### 기술적 의존성

**완료된 SPEC:**
- SPEC-INFRA-001 (완료): Docker Compose 기반 로컬 개발 환경

**완료된 Task:**
- Task #11 (완료): 통합 테스트 인프라

**필수 라이브러리:**
- `@nestjs/swagger`: 7.4.2 (이미 설치됨)
- `@nestjs/common`: 10.4.20
- Docker Compose: 2.20.0+

### 환경 의존성

**로컬 개발 환경:**
- Docker Desktop 또는 Docker Engine
- pnpm 9.15.1

**프로덕션 환경:**
- Docker Compose 또는 Kubernetes (향후)
- 블록체인 RPC 엔드포인트 접근 가능

---

## 제약사항

### 기술적 제약사항

**NestJS 버전:**
- @nestjs/swagger: 7.4.2 고정 (기존 설치 버전)
- OpenAPI 3.0 스펙 준수

**Docker 제약사항:**
- 로컬 개발 환경은 docker-compose.yaml 사용 (SPEC-INFRA-001)
- Named Volume 전략 유지 (`msq-relayer-` 접두사)

### 보안 제약사항

**환경 변수 관리:**
- `.env.production`은 Git에 커밋 금지
- `.env.example`만 Git에 포함하여 템플릿 제공

**API 문서 접근:**
- Swagger UI는 내부 네트워크에서만 접근 가능
- 또는 API Key 인증 추가 (선택 사항)

### 파일 위치 제약사항

**환경 파일:**
- 프로젝트 루트에 `.env.*` 파일 배치

**문서 파일:**
- `docs/operations.md`: 운영 가이드
- `README.md`: 프로젝트 개요 (기존 파일 업데이트)

---

## 비기능적 요구사항

### 성능

**컨테이너 시작 시간:**
- 프로덕션 환경 전체 시작: < 60초 (Cold Start)
- relay-api 단일 replica: < 30초

**API 응답 시간:**
- Swagger UI 로딩: < 2초
- OpenAPI JSON 다운로드: < 1초

### 가용성

**Health Check:**
- relay-api: `/api/v1/health` 엔드포인트
- 실패 시 자동 재시작 (3회 연속 실패)

**리소스 관리:**
- CPU 및 Memory 제한 적용하여 안정성 확보

### 보안

**환경 변수 격리:**
- `.env.production`은 Git에서 제외
- 민감 정보는 `.env.example`에 플레이스홀더만 포함

**API 인증:**
- `x-api-key` 헤더 기반 인증
- Swagger UI에서 API Key 입력 지원

### 유지보수성

**문서화:**
- 모든 API 엔드포인트는 Swagger 문서화 필수
- 운영 가이드(`docs/operations.md`)에 절차 명시

**운영 절차:**
- 환경별 설정 파일로 표준화된 배포 절차 구현
- 신규 인력 온보딩 시 `docs/operations.md` 참조

---

## 추적성 (Traceability)

### Task Master 통합

**Task ID**: `12` (프로덕션 환경 설정, API 문서화 및 운영 가이드 작성)

**Subtasks (예상):**
- `12.1`: Swagger/OpenAPI 통합 및 모든 엔드포인트 문서화
- `12.2`: 환경별 설정 파일 생성 (.env.development, .env.staging, .env.production)
- `12.3`: 운영 가이드 작성 (docs/operations.md)

### PRD 참조

**PRD 섹션 (예상):**
- PRD Section X: 프로덕션 배포 요구사항
- PRD Section Y: API 문서화 요구사항
- PRD Section Z: 운영 및 모니터링 요구사항

### 관련 문서

**SPEC 문서:**
- `SPEC-INFRA-001`: Docker Compose 기반 인프라 (완료)

**Task Master:**
- `.taskmaster/tasks/task-12.md`: Task #12 상세 내역

**프로젝트 문서:**
- `README.md`: 프로젝트 개요 (업데이트 예정)
- `docs/operations.md`: 운영 가이드 (신규 생성)

---

## 완료 체크리스트

### Swagger/OpenAPI 통합
- [x] main.ts에 SwaggerModule 설정 추가
- [x] 모든 컨트롤러에 @ApiOperation, @ApiResponse 추가
- [x] 모든 DTO에 @ApiProperty 및 예제 값 추가
- [x] /api/docs 및 /api/docs-json 엔드포인트 검증
- [x] API Key 인증 방식 문서화

### 환경별 설정 파일
- [x] .env.development 작성
- [x] .env.staging 작성
- [x] .env.production 작성
- [x] .env.example 작성 및 Git 포함
- [x] .gitignore에 환경 파일 추가

### 운영 가이드
- [x] docs/operations.md 생성
- [x] 서비스 시작/중지 절차 작성
- [x] API 문서 접근 방법 작성
- [x] Client SDK 생성 가이드 작성
- [x] 모니터링 및 트러블슈팅 가이드 작성

### 검증
- [x] Swagger UI(/api/docs) 접근 및 API 문서 확인
- [x] OpenAPI JSON(/api/docs-json) 다운로드 및 스키마 검증

---

## 버전 정보

- **SPEC Version**: 2.0.0
- **Created**: 2024-12-25
- **Last Updated**: 2024-12-25
- **Status**: Draft
- **Priority**: Medium

---

## 변경 이력

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2024-12-25 | Task #12 기반 초기 SPEC 생성 - 프로덕션 환경 설정, API 문서화, 운영 가이드 | @user |
