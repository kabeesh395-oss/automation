/**
 * JARVIS Context-Efficient Prompt Builder
 * 
 * Constructs task-scoped prompts with minimal token overhead:
 * - Scoped requirements and architecture summaries
 * - Relevant file excerpts instead of full repo dumps
 * - Explicit JSON schema specifications
 */

export function buildProductAnalysisPrompt(userRequest) {
  const systemPrompt = `You are the Lead Product Analyst for JARVIS, an autonomous software development orchestrator.
Your job is to analyze the user's software idea and generate a complete, production-grade product requirement specification.

CRITICAL RULES:
1. Distinguish between EXPLICIT user requirements and INFERRED technical/domain requirements.
2. Record genuine assumptions and unresolved questions clearly rather than inventing arbitrary requirements.
3. Detect the target platform accurately: 'android', 'web', or 'backend'.
4. Return ONLY valid JSON matching the requirements schema. Do not wrap in conversational text.

Output JSON Structure:
{
  "app_name": "kebab-case-name",
  "target_platform": "android" | "web" | "backend",
  "problem_statement": "string",
  "target_users": ["string"],
  "core_features": [
    {
      "id": "F001",
      "name": "feature-name",
      "description": "string",
      "priority": "must" | "should" | "could",
      "source": "explicit" | "inferred",
      "acceptance_criteria": ["string"]
    }
  ],
  "non_functional_requirements": [
    { "name": "string", "description": "string" }
  ],
  "auth_requirements": {
    "required": boolean,
    "strategy": "none" | "local_session" | "oauth" | "jwt"
  },
  "data_requirements": {
    "persistence": "none" | "in_memory" | "local_persistence" | "relational_db" | "nosql",
    "entities": ["EntityName(fields...)"]
  },
  "ai_requirements": {
    "required": boolean,
    "capabilities": ["string"]
  },
  "integrations": ["string"],
  "constraints": ["string"],
  "assumptions": ["string"],
  "unresolved_questions": ["string"],
  "acceptance_criteria": ["string"]
}`;

  const userPrompt = `User Software Idea:
"${userRequest}"

Analyze this idea and generate the structured requirements JSON.`;

  return { systemPrompt, userPrompt };
}

export function buildArchitecturePrompt(requirements) {
  const systemPrompt = `You are the Lead Software Architect for JARVIS.
Design the technical architecture for the given product requirements.

CRITICAL RULES:
1. Select modern, production-grade technology stacks suited for the target platform:
   - For 'android': Kotlin, Jetpack Compose, Material3, ViewModel/StateFlow, Gradle Kotlin DSL, SDK 34 (Min 24).
   - For 'web': Modern React/Vite or Next.js with clean modular components.
   - For 'backend': Node.js (Express/Fastify) or Kotlin/Java (Spring Boot) with RESTful API architecture.
2. Provide concrete build commands, test commands, and module dependencies.
3. Return ONLY valid JSON matching the architecture schema.

Output JSON Structure:
{
  "platform": "android" | "web" | "backend",
  "language": "string",
  "framework": "string",
  "modules": [
    { "name": "string", "type": "string", "description": "string", "dependencies": ["string"] }
  ],
  "data_layer": {
    "strategy": "string",
    "storage": "string",
    "schema_details": "string"
  },
  "backend_strategy": {
    "type": "string",
    "api_protocol": "string",
    "endpoints": [
      { "path": "string", "method": "string", "description": "string" }
    ]
  },
  "ai_strategy": {
    "enabled": boolean,
    "provider": "string",
    "models": ["string"]
  },
  "auth_strategy": {
    "enabled": boolean,
    "provider": "string"
  },
  "security_requirements": ["string"],
  "build_configuration": {
    "tool": "gradle" | "npm",
    "target_version": "string",
    "build_command": "string",
    "test_command": "string"
  },
  "decisions": [
    { "id": "D001", "decision": "string", "reason": "string", "date": "ISO string" }
  ]
}`;

  const userPrompt = `Product Requirements Summary:
- App Name: ${requirements.app_name}
- Target Platform: ${requirements.target_platform}
- Features: ${requirements.core_features.map(f => `${f.name} (${f.description})`).join('; ')}
- Data Model: Persistence: ${requirements.data_requirements?.persistence}; Entities: ${requirements.data_requirements?.entities?.join(', ') || 'None'}
- Auth Required: ${requirements.auth_requirements?.required} (${requirements.auth_requirements?.strategy})

Design the system architecture JSON.`;

  return { systemPrompt, userPrompt };
}

export function buildUxPlanPrompt(requirements, architecture) {
  const systemPrompt = `You are the Lead UX/UI Architect for JARVIS.
Design the user experience hierarchy, composable screen structure, user flows, and state handling.

CRITICAL RULES:
1. For UI apps (Android/Web), define a complete navigation hierarchy, composable screens, component breakdowns, and state variants (loading, empty, error, initial).
2. For headless backend/API apps, define system interaction routes and response schemas with navigation_structure.pattern = 'HeadlessApi' and screens = [].
3. Return ONLY valid JSON matching the ux_plan schema.

Output JSON Structure:
{
  "navigation_structure": {
    "pattern": "SingleActivityWithComposableScreens" | "MultiPageRouter" | "HeadlessApi",
    "root_screen": "string",
    "routes": ["string"]
  },
  "screens": [
    {
      "id": "SCR01_NAME",
      "name": "ScreenName",
      "purpose": "string",
      "components": [
        { "name": "string", "type": "string", "description": "string", "interaction": "string" }
      ],
      "states": {
        "initial": "string",
        "loading": "string",
        "empty": "string",
        "error": "string"
      }
    }
  ],
  "user_flows": [
    {
      "name": "string",
      "trigger": "string",
      "steps": ["string"],
      "expected_outcome": "string"
    }
  ],
  "visual_theme": {
    "color_palette": {
      "primary": "string",
      "onPrimary": "string",
      "background": "string",
      "surface": "string"
    },
    "typography": "string",
    "dark_mode_support": boolean
  },
  "accessibility_considerations": ["string"]
}`;

  const userPrompt = `Product Requirements:
- App: ${requirements.app_name} on ${architecture.platform} (${architecture.framework})
- Features: ${requirements.core_features.map(f => f.name).join(', ')}

Design the UX Plan JSON.`;

  return { systemPrompt, userPrompt };
}

export function buildTaskPlannerPrompt(requirements, architecture, uxPlan) {
  const systemPrompt = `You are the Lead Implementation Planner for JARVIS.
Decompose the software project into an executable, dependency-aware Directed Acyclic Graph (DAG) of implementation tasks.

CRITICAL RULES:
1. Dynamically tailor tasks to the application's actual features and domain requirements. Do NOT output a generic one-size-fits-all fixed 6-task list.
2. Every task must have:
   - Unique deterministic ID (e.g. T001_SCAFFOLD, T002_DATA_LAYER, T003_FEATURE_HABITS, etc.)
   - Clear task type: 'scaffold' | 'domain_logic' | 'ui_implementation' | 'api' | 'testing' | 'build' | 'verification'
   - Explicit dependency IDs (parent tasks that must finish before this task can start)
   - Specific affected file paths
   - Concrete, verifiable acceptance criteria
3. Include an automated unit test task and a clean build/packaging task at the appropriate stages in the DAG.
4. Return ONLY valid JSON matching the task plan schema.

Output JSON Structure:
{
  "tasks": [
    {
      "id": "T001_SCAFFOLD",
      "type": "scaffold" | "domain_logic" | "ui_implementation" | "api" | "testing" | "build" | "verification",
      "description": "string",
      "owner": "android_engineer" | "frontend_engineer" | "backend_engineer" | "qa_test_engineer" | "build_release_engineer" | "master_orchestrator",
      "dependencies": ["string"],
      "affected_files": ["string"],
      "verification": {
        "criteria": ["string"]
      }
    }
  ]
}`;

  const userPrompt = `Project Summary:
- App Name: ${requirements.app_name} (${architecture.platform})
- Stack: ${architecture.language} with ${architecture.framework}
- Features: ${requirements.core_features.map(f => `${f.name}: ${f.description}`).join('\n')}
- Screens: ${uxPlan.screens?.map(s => s.name).join(', ') || 'Headless'}

Generate the dynamic implementation task DAG JSON.`;

  return { systemPrompt, userPrompt };
}

export function buildCodeGenerationPrompt(task, requirements, architecture, uxPlan, existingFilesContext = '') {
  const systemPrompt = `You are a Senior Software Engineer for JARVIS.
Your job is to implement the assigned engineering task cleanly, idiomatically, and completely.

CRITICAL RULES:
1. Generate complete, working source code without placeholders, TODOs, or fake stubs.
2. Adhere strictly to the project architecture:
   - Target: ${architecture.platform} (${architecture.language} + ${architecture.framework})
   - Build Tool: ${architecture.build_configuration.tool}
3. Specify all file creations or modifications using the Safe File Patch Protocol JSON format.
4. Return ONLY valid JSON with the changes array.

Output JSON Structure:
{
  "changes": [
    {
      "path": "relative/path/to/file.ext",
      "operation": "create" | "modify" | "delete",
      "content": "Full source code for the file"
    }
  ],
  "summary": "Brief explanation of changes made"
}`;

  const userPrompt = `Current Task:
- ID: ${task.id || task.task_id}
- Type: ${task.type}
- Description: ${task.description}
- Target Files: ${(task.affected_files || []).join(', ')}
- Verification Criteria: ${(task.verification?.criteria || []).join('; ')}

App Requirements Context:
- App: ${requirements.app_name} (${architecture.platform})
- Features: ${requirements.core_features.map(f => f.name).join(', ')}

Existing Files / Environment Context:
${existingFilesContext || 'No existing project files loaded.'}

Implement this task and return the file changes JSON.`;

  return { systemPrompt, userPrompt };
}

export function buildDebugRecoveryPrompt(errorContext) {
  const systemPrompt = `You are the Autonomous Debugging Engineer for JARVIS.
Analyze the build/test error and produce a minimal, targeted patch to resolve the root cause.

CRITICAL RULES:
1. Do not repeat previously attempted fixes that failed.
2. Analyze the actual compiler logs, stack traces, and source files.
3. Return the minimal source file modifications required to fix the error.
4. Return ONLY valid JSON matching the Safe File Patch Protocol.

Output JSON Structure:
{
  "root_cause": "Explanation of what caused the failure",
  "changes": [
    {
      "path": "relative/path/to/file.ext",
      "operation": "create" | "modify" | "delete",
      "content": "Full corrected file content"
    }
  ],
  "fix_summary": "Brief summary of the fix"
}`;

  const userPrompt = `Failure Details:
- Task: ${errorContext.taskId}
- Error Category: ${errorContext.classification.type} (${errorContext.classification.category})
- Error Log Excerpt:
${errorContext.errorLog}

Previous Attempted Fixes (DO NOT REPEAT):
${errorContext.previousFixes?.map(f => `- ${f}`).join('\n') || 'None'}

Relevant Source Code:
${errorContext.sourceCodeContext || 'Not available'}

Analyze the failure and return the corrective file changes JSON.`;

  return { systemPrompt, userPrompt };
}
