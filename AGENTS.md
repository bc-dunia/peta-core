# AGENTS.md - Codex Development Guidelines

This file provides Codex with project development guidelines and knowledge base references.

## Project Overview

Peta Core is an MCP protocol proxy service that provides authentication, rate limiting, session management, event persistence, and OAuth 2.0 support.

### Tech Stack
- TypeScript + ESM (imports use `.js` extension)
- PostgreSQL + Prisma ORM
- Express + Socket.IO
- MCP Protocol

### Core Directory Structure

```
src/
├── mcp/           # MCP proxy core
│   ├── core/      # ProxySession, ServerManager, SessionStore
│   ├── services/  # Business services
│   └── controllers/
├── oauth/         # OAuth 2.0 implementation
├── socket/        # Socket.IO real-time communication
├── security/      # Authentication & authorization
├── middleware/    # Middleware
├── repositories/  # Data access layer
└── logger/        # Pino logging
```

---

## Knowledge Base Locations

| What to Know | Read File |
|-------------|-----------|
| Project architecture, module details | `CLAUDE.md` |
| Tool capabilities list | `mcp-tools-guide.md` |
| Multi-agent collaboration workflow | `PROJECT_COLLABORATION.md` |
| Database Schema | `prisma/schema.prisma` |

### API Documentation
- `docs/api/API.md` - MCP API endpoints
- `docs/api/ADMIN_API.md` - Admin API endpoints
- `docs/api/SOCKET_USAGE.md` - Socket.IO usage guide

### Architecture Design
- `docs/architecture/EVENTSTORE_README.md` - EventStore architecture
- `docs/architecture/MCP_PROXY_REQUESTID_SOLUTION.md` - RequestId mapping design
- `docs/architecture/MCP_ADVANCED_FEATURES.md` - MCP advanced features

### Implementation Records
- `docs/implementation/` - Feature implementation documentation

### Migration Guides
- `docs/migration/` - Migration-related documentation

---

## Development Guidelines

### Code Style
- 2-space indentation, single quotes
- Class names `PascalCase`, functions/variables `camelCase`
- Relative imports use `.js` extension
- Environment variables `UPPER_SNAKE_CASE`
- Configuration in `.env` file, no hardcoded secrets

### Logging Guidelines
```typescript
import { createLogger } from '../logger/index.js';
const logger = createLogger('ModuleName');

// Log levels: trace < debug < info < warn < error < fatal
logger.info({ userId, requestId }, 'Processing request');
logger.error({ error }, 'Failed to process');
```

### Error Handling
- Use structured error types (AuthError, McpError)
- Logs include context (userId, sessionId, requestId)

---

## Post-Development Update Workflow

1. **Documentation Updates**
   - New modules/interfaces → Update `CLAUDE.md` architecture description
   - API changes → Update `docs/api/API.md`
   - New features → Create `FeatureName_IMPLEMENTATION.md` in `docs/implementation/`

2. **Knowledge Sharing**
   - Complex implementations → Add to "Implementation Patterns" in `CLAUDE.md`
   - Lessons learned → Add to "Common Pitfalls" in `CLAUDE.md`

3. **Testing & Verification**
   - Run `npm test` to verify
   - Run `npm run build` to ensure compilation succeeds

---

## Documentation Management Principles

- ❌ Do not create duplicate documents
- ✅ Update existing documents, maintain single source of truth
- ✅ Check for existing related documents before modifying

---

## Common Commands

### Development
```bash
npm run dev              # Start development server
npm run dev:backend-only # Start backend only
npm run build            # Compile TypeScript
npm run rebuild          # Clean and rebuild
```

### Database
```bash
npm run db:start         # Start PostgreSQL
npm run db:init          # Initialize database
npm run db:studio        # Open Prisma Studio
npm run db:migrate:deploy # Apply migrations
```

### Testing
```bash
npm test                 # Run all tests
npm test -- --testPathPattern=filename  # Run specific test
```

---

## Reference Documentation

- `CLAUDE.md` - Complete project architecture (**Required reading**)
- `PROJECT_COLLABORATION.md` - Multi-agent collaboration documentation
- `README.md` - Project introduction
