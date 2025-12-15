# MSQ Relayer Service

**Blockchain Transaction Relayer System** - B2B Infrastructure

OpenZeppelin Defender 서비스 종료(2026년 7월)에 대비한 self-hosted 블록체인 트랜잭션 릴레이 시스템입니다.

## Overview

MSQ Relayer Service는 내부 서비스들(결제 시스템, 에어드랍, NFT 서비스 등)이 블록체인 트랜잭션을 쉽게 처리할 수 있도록 지원하는 B2B Infrastructure입니다.

### Core Components

| Component | Version | Role |
|-----------|---------|------|
| **OZ Relayer** | v1.3.0 | TX 중계, Nonce/Gas 관리, 재시도 로직 |
| **OZ Monitor** | v1.1.0 | 블록체인 이벤트 모니터링, 잔액 알림 |
| **NestJS API Gateway** | 10.x | 인증, 정책 엔진, 할당량 관리 |

### Key Features

- **Direct Transaction**: 자동화 트랜잭션 실행 (결제, 에어드랍, Oracle)
- **Gasless Transaction**: End User 가스비 대납 (NFT, 게임 서비스)
- **Monitor Service**: 블록체인 이벤트 및 잔액 모니터링

## Documentation

상세 문서는 [docs/](./docs/) 디렉토리를 참조하세요:

- [Product](./docs/product.md) - 제품 요구사항 (WHAT/WHY)
- [Structure](./docs/structure.md) - 시스템 아키텍처 (WHERE)
- [Tech](./docs/tech.md) - 기술 스펙 (HOW)

## Status

🚧 **Planning Phase** - 현재 설계 및 문서화 단계입니다.

---

**Version**: 0.1.0 (Planning)
