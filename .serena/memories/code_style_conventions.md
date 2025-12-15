# MSQ Relayer Service - Code Style & Conventions

## TypeScript/NestJS Conventions

### File Naming
- Kebab-case for files: `direct.controller.ts`, `api-key.service.ts`
- Module structure: `{feature}.module.ts`, `{feature}.controller.ts`, `{feature}.service.ts`

### Module Organization (NestJS)
```typescript
// Module structure example
src/
├── auth/
│   ├── auth.module.ts
│   ├── auth.guard.ts
│   └── api-key.service.ts
├── relay/
│   ├── relay.module.ts
│   ├── direct/
│   │   ├── direct.controller.ts
│   │   └── direct.service.ts
│   └── status/
│       ├── status.controller.ts
│       └── status.service.ts
└── common/
    ├── filters/
    ├── interceptors/
    └── decorators/
```

### TypeScript Style
- Use `class-validator` decorators for DTOs
- Use `class-transformer` for transformation
- Prefer interfaces for type definitions
- Use async/await over promises

### API Response Format
```typescript
// All API responses use ApiResponse<T> wrapper
interface ApiResponse<T> {
  data: T | null;
  error?: string;
  success: boolean;
}
```

### API Versioning
- All endpoints prefixed with `/api/v1/`
- Examples: `/api/v1/relay/direct`, `/api/v1/health`

## Solidity Conventions

### File Naming
- PascalCase for contract files: `SampleToken.sol`, `SampleNFT.sol`
- Compiler version: `0.8.20`

### Contract Style
- Use OpenZeppelin Contracts v5.3.0
- Inherit `ERC2771Context` for gasless support
- Prefer `_msgSender()` over `msg.sender`

## Documentation Standards
- Keep comments minimal, code should be self-explanatory
- Use JSDoc for public APIs
- Maintain README.md in each package

## Testing Conventions
- Jest for NestJS tests
- Hardhat for Solidity tests
- Test files: `*.spec.ts` (unit), `*.e2e-spec.ts` (integration)
