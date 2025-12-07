# MCP Tools Analysis and Usage Guide

This document provides a detailed analysis of the available tools in Claude Code MCP Server and Codex MCP Server, summarizes their features and use cases, and provides best practice recommendations.

## I. Claude Code MCP Server Tools Analysis

### 1. Code Operation Tools

#### Read
- **Function**: Read file contents (supports images, PDF, Jupyter notebooks)
- **Features**: 
  - Supports absolute and relative paths
  - Can specify line range (offset and limit)
  - Automatically handles images, PDF, and Jupyter notebook formats
- **Best For**: File reading, code review, document analysis

#### Edit
- **Function**: Precise string replacement editing
- **Features**:
  - Must provide exact matching old_string
  - Supports replace_all parameter for batch replacement
  - Must Read file before editing
- **Best For**: Precise code modification, variable renaming, batch replacement

#### Write
- **Function**: Write new files or overwrite existing files
- **Features**:
  - If existing file, must Read first
  - Supports creating new files
- **Best For**: Creating new files, generating code templates, documentation writing

#### NotebookEdit
- **Function**: Edit Jupyter notebook cells
- **Features**:
  - Supports replace, insert, delete cells
  - Requires cell_id or cell_number
  - Supports code and markdown types
- **Best For**: Data science workflows, interactive document editing

### 2. Code Search Tools

#### Grep
- **Function**: Powerful regex search (based on ripgrep engine)
- **Features**:
  - Supports full regex syntax
  - Can filter by file type (type parameter)
  - Supports multiline matching (multiline mode)
  - Supports context display (-A, -B, -C parameters)
- **Best For**: Codebase search, pattern matching, cross-file search

#### Glob
- **Function**: Fast file pattern matching
- **Features**:
  - Supports glob patterns (e.g., `**/*.ts`)
  - Returns results sorted by modification time
  - Performance optimized, suitable for large codebases
- **Best For**: File finding, batch file operations, project structure exploration

#### Task
- **Function**: Launch specialized agents for complex multi-step tasks
- **Features**:
  - Supports multiple agent types (code-reviewer, test-runner, etc.)
  - Can launch multiple agents in parallel
  - Agents are autonomous and return final reports
- **Best For**: Complex task decomposition, code review, test running

### 3. Terminal Operation Tools

#### Bash
- **Function**: Execute bash commands (persistent shell session)
- **Features**:
  - Maintains shell state (environment variables, working directory, etc.)
  - Supports background running (run_in_background)
  - Default timeout 2 minutes (configurable)
  - Automatically handles spaces in paths
- **Best For**: Git operations, package management, build commands, long-running tasks

#### BashOutput
- **Function**: Get output from background commands
- **Features**:
  - Returns only new output (incremental reading)
  - Supports regex filtering
  - Can monitor running status
- **Best For**: Monitoring long-running tasks, getting build logs

#### KillShell
- **Function**: Terminate background shell processes
- **Features**:
  - Identified by shell_id
  - Graceful process termination
- **Best For**: Canceling long-running tasks, resource cleanup

### 4. Task Management Tools

#### TodoWrite
- **Function**: Create and manage task lists
- **Features**:
  - Supports task states (pending, in_progress, completed, cancelled)
  - Can merge with existing task lists
  - Helps track progress of complex tasks
- **Best For**: Complex task decomposition, progress tracking, project management

#### ExitPlanMode
- **Function**: Exit plan mode
- **Features**:
  - Only used in plan mode
  - Requires providing plan content for user confirmation
- **Best For**: Plan confirmation, pre-execution checks

### 5. Network and Information Tools

#### WebFetch
- **Function**: Fetch and process content from URLs
- **Features**:
  - Automatically converts HTML to markdown
  - Uses AI model to process content
  - 15-minute caching mechanism
  - Supports redirect handling
- **Best For**: Getting latest documentation, content analysis, web scraping

#### WebSearch
- **Function**: Web search
- **Features**:
  - Supports domain filtering (allowed_domains, blocked_domains)
  - Returns search result summaries
  - Only available in the US
- **Best For**: Technical information search, latest news retrieval, Q&A

### 6. Special Function Tools

#### Skill
- **Function**: Execute specific skills (e.g., PDF, Excel processing)
- **Features**:
  - Requires specifying skill name
  - Supports multiple file format processing
- **Best For**: Specific format file processing, professional tool integration

#### SlashCommand
- **Function**: Execute custom slash commands
- **Features**:
  - Command must be in Available Commands list
  - Supports command parameters
- **Best For**: Custom workflows, quick operations

## II. Codex MCP Server Tools Analysis

### 1. Core Tools

Codex MCP Server exposes two types of tools:
- **codex**: Used to start a complete Codex session
- **codex-reply**: Continue an existing session (pass conversationId)

#### codex
Start a new Codex session, supporting autonomous code generation and modification.

**Configuration Parameters**:
- `prompt`: Initial user prompt (**required**)
- `model`: Model selection (e.g., `o3` / `o4-mini`)
- `cwd`: Working directory
- `sandbox`: Sandbox mode
  - `read-only`: Read-only mode, cannot modify files
  - `workspace-write`: Can write to workspace files
  - `danger-full-access`: Full access permissions (dangerous)
- `approval-policy`: Approval policy
  - `untrusted`: Untrusted commands require approval
  - `on-failure`: Request approval on failure
  - `never`: Never request approval
- `profile`: Configuration profile
- `base-instructions`: Custom base instructions (can override config.toml defaults)
- `developer-instructions`: Developer instructions
- Whether to enable planning tools, etc. (can override config.toml defaults)

**Connection Methods**:
- Default STDIO
- Can also serve as a streamable HTTP MCP server (supports Bearer / OAuth, requires enabling RMCP client in configuration)

**Session Features**:
- Long-running process, streaming event output (thinking, progress, file changes)
- Suitable for time-consuming tasks or multi-round collaboration

**Typical Usage**:
- Start in local CLI: `codex mcp-server`, or with Inspector: `npx @modelcontextprotocol/inspector codex mcp-server`
- In Agents SDK as backend executor, building "start Codex first, then call codex-reply multiple rounds" automation pipelines

**Best For**:
- Code generation and modification (including direct patch application)
- In-repository context reasoning
- Auditable execution of long-running tasks (event stream recording)
- Coordination with other MCP clients/agents

#### codex-reply
Continue an existing Codex conversation.

**Parameters**:
- `conversationId`: Session ID (**required**)
- `prompt`: Prompt to continue the conversation

**Best For**:
- Multi-round conversations maintaining context
- Iterative development
- Progressive code refinement
- Building automation pipelines in Agents SDK

## III. Tool Collaboration Strategies

### Scenario 1: Large Refactoring Tasks

**Workflow**:
1. Use **TodoWrite** to break down tasks into subtasks
2. Use **Grep/Glob** to find all related files
3. Use **Read** to read key files and understand code structure
4. Use **codex** to start a Codex session for complex logic
5. Use **Edit** for precise modifications
6. Use **Bash** to run tests and build verification

**Example**:
```bash
# 1. Create task list
TodoWrite: Break down refactoring tasks

# 2. Find all related files
Grep: Search for function names to refactor
Glob: Find specific types of files

# 3. Start Codex to handle complex logic
codex: "Refactor this function, improve performance and readability"

# 4. Precise modifications
Edit: Apply Codex suggestions

# 5. Verification
Bash: Run test suite
```

### Scenario 2: New Feature Development

**Workflow**:
1. Use **WebSearch/WebFetch** to get latest documentation and examples
2. Use **Task** to launch specialized agents for specific subtasks
3. Use **Write** to create new files
4. Use **codex** to generate boilerplate code
5. Use **Bash** to verify functionality

**Example**:
```bash
# 1. Research
WebSearch: "React 18 latest features"
WebFetch: "https://react.dev/docs/..."

# 2. Create file structure
Write: Create new component file
Write: Create test file

# 3. Generate code
codex: "Implement a React component with the following features..."

# 4. Verification
Bash: npm run test
Bash: npm run build
```

### Scenario 3: Codebase Exploration

**Workflow**:
1. Use **Glob** to quickly locate files
2. Use **Grep** to search code patterns
3. Use **Read** to deeply understand code
4. Use **codex** to analyze code structure

**Example**:
```bash
# 1. Find files
Glob: "**/*.tsx"  # Find all React components

# 2. Search patterns
Grep: "useState|useEffect"  # Find React hooks usage

# 3. Deep understanding
Read: Read key files

# 4. Analysis
codex: "Analyze this codebase's architecture and design patterns"
```

### Scenario 4: Document Processing

**Workflow**:
1. Use **WebFetch** to get online documentation
2. Use **Skill** to process PDF/Excel files
3. Use **NotebookEdit** to edit Jupyter notebooks
4. Use **Write** to generate documentation

**Example**:
```bash
# 1. Get documentation
WebFetch: "https://docs.example.com/api"

# 2. Process files
Skill: "pdf"  # Process PDF files

# 3. Edit Notebook
NotebookEdit: Update data analysis cells

# 4. Generate documentation
Write: Create API documentation
```

## IV. Best Practice Recommendations

### Claude Code Tool Usage Principles

1. **Prefer Specialized Tools**
   - ✅ Use `Grep` instead of `bash grep`
   - ✅ Use `Read` instead of `cat`
   - ✅ Use `Glob` instead of `find`
   - Reason: Specialized tools have better performance and safer permission handling

2. **Execute Independent Operations in Parallel**
   - Multiple file reads can be parallelized
   - Multiple searches can be parallelized
   - Improves efficiency, reduces wait time

3. **Task Decomposition**
   - Use `TodoWrite` to break down complex tasks
   - Use `Task` tool to launch specialized agents
   - Keep task granularity appropriate

4. **File Operation Standards**
   - Must `Read` before editing
   - Keep `old_string` exact match (including indentation)
   - Use `replace_all` for batch replacement

5. **Path Handling**
   - Prefer absolute paths
   - Note that paths with spaces need quotes

### Codex Tool Usage Principles

1. **Suitable for Complex Tasks**
   - Scenarios requiring multi-round reasoning
   - Scenarios requiring code generation and modification (including direct patch application)
   - Scenarios requiring autonomous decision-making
   - Auditable execution of long-running tasks (event stream recording)
   - In-repository context reasoning

2. **Configuration Selection**
   - **Development environment**: Use `workspace-write` sandbox
   - **Read-only analysis**: Use `read-only` sandbox
   - **Production environment**: Use `danger-full-access` cautiously
   - All configuration parameters can override config.toml defaults

3. **Model Selection**
   - **Simple tasks**: Use `o4-mini` (fast, low cost)
   - **Complex tasks**: Use `o3` (high quality)

4. **Approval Policy**
   - **Development phase**: `on-failure` or `on-request`
   - **Production environment**: `never` (requires thorough testing)
   - **Untrusted code**: `untrusted`

5. **Session Management**
   - Use `codex-reply` to continue conversations, maintain context continuity
   - Build "start Codex first, then call codex-reply multiple rounds" automation pipelines in Agents SDK
   - Observe and drive sessions through MCP Inspector
   - Clean up unneeded sessions promptly

6. **Connection Methods**
   - Default STDIO connection
   - When streaming HTTP access is needed, configure RMCP client (supports Bearer / OAuth)

7. **Typical Startup Methods**
   - Local CLI: `codex mcp-server`

### Tool Combination Strategies

#### Exploration Phase
```
Glob → Locate files
  ↓
Grep → Search patterns
  ↓
Read → Understand code
  ↓
WebSearch → Get background information
```

#### Development Phase
```
WebFetch → Get documentation
  ↓
Write → Create files
  ↓
codex → Generate code
  ↓
Edit → Precise adjustments
  ↓
Bash → Verify functionality
```

#### Testing Phase
```
Grep → Find test files
  ↓
Read → Understand test structure
  ↓
Bash → Run tests
  ↓
BashOutput → View results
```

#### Documentation Phase
```
WebFetch → Get reference documentation
  ↓
Skill → Handle special formats
  ↓
Write → Generate documentation
  ↓
NotebookEdit → Update examples
```

## V. Important Notes

### General Notes

1. **Plan Mode**
   - Cannot execute modification operations when in plan mode
   - Use `ExitPlanMode` to exit plan mode

2. **Path Requirements**
   - Codex tools require absolute paths
   - Claude Code tools support both relative and absolute paths

3. **Permission Control**
   - Codex sandbox mode controls file access permissions
   - Note permission differences between modes

4. **Performance Optimization**
   - Use parallel calls to improve efficiency
   - Avoid unnecessary file reads
   - Use caching mechanisms appropriately

5. **Error Handling**
   - Bash commands have timeout limits (default 2 minutes)
   - Use background mode for long-running tasks
   - Check command return values

### Codex-Specific Notes

1. **Session Management**
   - Each session is a long-running process, supporting streaming event output (thinking, progress, file changes)
   - Use `conversationId` to continue sessions
   - Suitable for time-consuming tasks or multi-round collaboration
   - Observe and drive through MCP Inspector or Agents SDK
   - Clean up unneeded sessions promptly

2. **Model Selection**
   - Choose model based on task complexity (e.g., `o3` / `o4-mini`)
   - Use lightweight models for simple tasks to save costs
   - Use high-quality models for complex tasks

3. **Approval Policy**
   - Understand the meaning of different policies (`untrusted` / `on-failure` / `never`)
   - Choose appropriate policy based on environment
   - Be aware of security risks

4. **Working Directory**
   - Set correct `cwd`
   - Note relative path resolution

5. **Configuration Override**
   - All session parameters can override config.toml defaults
   - Including prompt, model, sandbox, approval-policy, whether to enable planning tools, etc.

6. **Connection Methods**
   - Default STDIO connection
   - HTTP MCP server access requires configuring RMCP client (supports Bearer / OAuth)

7. **Typical Usage**
   - Local CLI: `codex mcp-server`
   - In Agents SDK as backend executor, building automation pipelines

## VI. Practical Application Examples

### Example 1: Adding New Features

```bash
# 1. Research phase
WebSearch: "React Query latest usage"
WebFetch: "https://tanstack.com/query/latest"

# 2. Create files
Write: frontend/hooks/use-query.ts
Write: frontend/components/query-provider.tsx

# 3. Generate code
codex: "Implement a React Query hook supporting data fetching and caching"

# 4. Integration
Edit: Update main app file, add QueryProvider

# 5. Test
Bash: cd frontend && npm run test
Bash: cd frontend && npm run type-check
```

### Example 2: Refactoring Existing Code

```bash
# 1. Analyze existing code
Grep: "useState" path:frontend/components
Glob: "**/*.tsx" path:frontend/components

# 2. Create task list
TodoWrite: [
  "Refactor Component A",
  "Refactor Component B",
  "Update tests"
]

# 3. Start Codex refactoring
codex: "Refactor this component, extract logic using custom hooks"

# 4. Apply changes
Edit: Apply refactoring suggestions

# 5. Verify
Bash: npm run lint
Bash: npm run build
```

### Example 3: Code Review

```bash
# 1. Find changes
Bash: git diff HEAD~1

# 2. Launch review agent
Task: code-reviewer "Review code changes in this commit"

# 3. Analyze results
Read: Review report

# 4. Apply suggestions
codex: "Fix code issues based on review suggestions"
```

## VII. Summary

### Claude Code MCP Server Advantages
- ✅ Rich file operation tools
- ✅ Powerful search capabilities
- ✅ Flexible terminal operations
- ✅ Complete task management

### Codex MCP Server Advantages
- ✅ Autonomous code generation and modification (including direct patch application)
- ✅ Complex task handling (auditable execution of long-running tasks)
- ✅ Multi-round conversation support (long-running process, streaming event output)
- ✅ Flexible configuration options (can override config.toml defaults)
- ✅ In-repository context reasoning
- ✅ Coordination with other MCP clients/agents
- ✅ Supports STDIO and HTTP MCP server access
- ✅ Observe and drive through MCP Inspector or Agents SDK

### Best Practices
1. **Choose the Right Tool**: Select the most appropriate tool based on task characteristics
2. **Use in Combination**: Multiple tools working together, leveraging their respective strengths
3. **Performance Optimization**: Execute independent operations in parallel, improve efficiency
4. **Security First**: Pay attention to permission control and approval policies
5. **Continuous Learning**: Continuously optimize workflows based on practical experience

---

**Last Updated**: 2025-01-27  
**Version**: 1.0.0  
**Author**: Claude Code
