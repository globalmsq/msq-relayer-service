# MSQ Relayer Service - Task Completion Checklist

## Before Marking Task Complete

### Code Quality
- [ ] Code follows project conventions (see code_style_conventions.md)
- [ ] No TypeScript errors (`npm run build` passes)
- [ ] Linting passes (`npm run lint`)
- [ ] Code is properly formatted (`npm run format`)

### Testing
- [ ] Unit tests written for new functionality
- [ ] All existing tests pass (`npm run test`)
- [ ] E2E tests pass if applicable (`npm run test:e2e`)

### Documentation
- [ ] Public APIs have JSDoc comments
- [ ] README updated if new features added
- [ ] API changes reflected in Swagger decorators

### Smart Contracts (if applicable)
- [ ] Contracts compile (`npx hardhat compile`)
- [ ] Contract tests pass (`npx hardhat test`)
- [ ] Gas optimization considered

### Security
- [ ] No hardcoded secrets
- [ ] Input validation in place
- [ ] Rate limiting considered
- [ ] Whitelist/blacklist patterns followed

### Integration
- [ ] Docker Compose configuration updated if needed
- [ ] Environment variables documented in .env.example
- [ ] OZ Relayer configuration updated if needed

## Commands to Run Before Completion

```bash
# API Gateway
cd packages/api-gateway
npm run lint
npm run build
npm run test

# Contracts (if changed)
cd packages/contracts
npx hardhat compile
npx hardhat test

# Full system test
docker compose up -d
curl http://localhost:3000/api/v1/health
```

## Git Commit Guidelines
- Prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Keep commits atomic and focused
- Reference issue/task IDs when applicable
