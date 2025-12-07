# Contributing Guide

Thank you for considering contributing to Peta MCP Gateway!

## How to Contribute

### Reporting Issues

If you find a bug or have a feature request, please:

1. Check [Issues](https://github.com/dunialabs/peta-core/issues) to ensure the issue hasn't already been reported
2. Create a new Issue with the following information:
   - Clear title and description
   - Steps to reproduce (if applicable)
   - Expected behavior vs actual behavior
   - Environment information (Node.js version, operating system, etc.)
   - Relevant logs or screenshots

### Submitting Code

1. **Fork the Repository**
   ```bash
   git clone https://github.com/your-username/peta-core.git
   cd peta-core
   ```

2. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

3. **Set Up Development Environment**
   ```bash
   npm install
   npm run dev
   ```

4. **Make Changes**
   - Follow existing code style (2-space indentation, single quotes)
   - Use ESM with `.js` extensions on relative imports
   - Do not hardcode secrets; use environment variables and `.env`
   - Use Pino logger (do not use `console.log`)
   - Update relevant documentation (e.g., README.md, CLAUDE.md)
   - Add tests if necessary

5. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature" # or "fix: fix issue"
   ```

   **Commit Message Convention**:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation update
   - `refactor:` - Code refactoring
   - `test:` - Test related
   - `chore:` - Build/tool configuration

6. **Push to Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create Pull Request**
   - Create a Pull Request on GitHub
   - Clearly describe what changes were made and why
   - Link related Issues (if any)
   - Wait for Code Review

### Code Standards

- **TypeScript**: Use strict mode, avoid `any` type
- **Logging**: Use `createLogger('ModuleName')` to create module loggers
- **Error Handling**: Use structured error types (`AuthError`, `McpError`, etc.)
- **Async Operations**: Handle Promises correctly, use `async/await`
- **Resource Cleanup**: Ensure cleanup callbacks are properly registered and executed

### Important Implementation Patterns

Before modifying code, please read [CLAUDE.md](./CLAUDE.md) to understand:
- Request ID mapping system
- Reverse request routing mechanism
- Session lifecycle management
- Dual logging architecture

### Database Changes

If you need to modify the database Schema:

```bash
# 1. Modify prisma/schema.prisma
# 2. Create migration
npm run db:migrate:create

# 3. Apply migration
npm run db:init

# 4. Generate Prisma Client
npm run db:generate
```

### Testing

```bash
# Run all tests
npm test

# Run specific tests
npm test -- --testPathPattern=YourTest.test.ts
```

**Note**: The current test infrastructure is still under development.

## Development Notes

### Common Pitfalls

1. **Request ID Mapping**: Must use `RequestIdMapper` when forwarding requests
2. **Session References**: Must unregister from `GlobalRequestRouter` during cleanup
3. **Server Connections**: Downstream connections are shared by `ServerManager`, do not close them
4. **Async Cleanup**: Must await cleanup operations in close handlers

### Architecture Principles

- **Single Responsibility**: Each class/function should do only one thing
- **Dependency Injection**: Inject dependencies through constructors
- **Error First**: Use explicit error types instead of generic exceptions
- **Cleanup First**: Every resource creation should have corresponding cleanup logic

## Security Issues

If you discover a security vulnerability, please **do not** create a public Issue. Instead, contact us through:

- Send an email to the project team (support@dunialabs.io)
- Describe the vulnerability details, impact scope, and reproduction steps

We will respond and fix the issue as soon as possible.

## Code of Conduct

By participating in this project, you agree to:

- Respect all contributors
- Accept constructive criticism
- Focus on what is best for the project
- Show empathy towards community members

## License

By contributing code, you agree that your contributions will be licensed under the [Elastic License 2.0](./LICENSE).

---

Thank you again for your contribution! If you have any questions, feel free to ask in the Issues.
