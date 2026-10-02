/**
 * JARVIS Mock AI Provider (Test & Verification Only)
 * 
 * Provides deterministic, schema-compliant responses for framework unit testing.
 * Clearly labeled as TEST MOCK — not used in production autonomous runs.
 */

import { BaseAIProvider } from './base-provider.js';
import { parseStructuredResponse } from './response-parser.js';

export class MockAIProvider extends BaseAIProvider {
  constructor(options = {}) {
    super(options);
    this.customHandlers = options.handlers || {};
    this.isMock = true;
  }

  isConfigured() {
    return true;
  }

  setHandler(type, handlerFn) {
    this.customHandlers[type] = handlerFn;
  }

  async generateStructured({ systemPrompt, userPrompt, schema = null, schemaValidator = null, context = {} }) {
    // Check if custom handler exists
    const contextType = context.stage || context.type;
    if (contextType && this.customHandlers[contextType]) {
      const result = await this.customHandlers[contextType]({ systemPrompt, userPrompt, context });
      if (typeof result === 'string') {
        return parseStructuredResponse(result, schemaValidator);
      }
      return result;
    }

    // Dynamic mock response generation based on stage and prompt
    const stage = context.stage || '';
    const lower = userPrompt.toLowerCase();

    // 1. Product Analysis stage
    if (stage === 'analysis' || systemPrompt.includes('Lead Product Analyst')) {
      const isWeb = lower.includes('web') || lower.includes('expense') || lower.includes('csv');
      const isBackend = lower.includes('api') || lower.includes('rest') || lower.includes('crud') || lower.includes('backend');
      const targetPlatform = isBackend ? 'backend' : (isWeb ? 'web' : 'android');

      let appName = 'app';
      if (lower.includes('habit')) appName = 'habit-tracker';
      else if (lower.includes('expense')) appName = 'web-expense-tracker';
      else if (lower.includes('book') || lower.includes('rest')) appName = 'books-rest-api';

      const mockRequirements = {
        app_name: appName,
        target_platform: targetPlatform,
        problem_statement: `User requires an application to solve: ${userPrompt.slice(0, 100)}`,
        target_users: ['Primary mobile/web user'],
        core_features: [
          {
            id: 'F001',
            name: isBackend ? 'crud-operations' : (isWeb ? 'expense-manager' : 'habit-manager'),
            description: `Core feature supporting the primary workflow`,
            priority: 'must',
            source: 'explicit',
            acceptance_criteria: ['Feature compiles', 'Logic behaves as specified', 'Unit test passes']
          },
          {
            id: 'F002',
            name: isBackend ? 'pagination-search' : (isWeb ? 'monthly-analytics' : 'weekly-progress'),
            description: `Secondary feature providing overview and progress insights`,
            priority: 'must',
            source: 'explicit',
            acceptance_criteria: ['Visual overview displays correct state', 'Data is calculated accurately']
          }
        ],
        non_functional_requirements: [
          { name: 'buildability', description: 'Clean compilation on target toolchain' },
          { name: 'testability', description: 'Unit test suite with 100% pass rate' }
        ],
        auth_requirements: {
          required: lower.includes('auth') || lower.includes('login'),
          strategy: lower.includes('auth') || lower.includes('login') ? 'local_session' : 'none'
        },
        data_requirements: {
          persistence: 'local_persistence',
          entities: [isBackend ? 'Book(id, title, author)' : (isWeb ? 'Expense(id, amount, category)' : 'Habit(id, name, completed, streak)')]
        },
        ai_requirements: {
          required: false,
          capabilities: []
        },
        integrations: [],
        constraints: ['Standard toolchain compatibility'],
        assumptions: ['Standard UI / API error boundaries'],
        unresolved_questions: [],
        acceptance_criteria: ['Clean build', 'Tests pass', 'Verification report generated']
      };

      if (schemaValidator) schemaValidator(mockRequirements);
      return mockRequirements;
    }

    // 2. Architecture stage
    if (stage === 'architecture' || systemPrompt.includes('Lead Software Architect')) {
      const isWeb = lower.includes('web') || lower.includes('expense') || (context.requirements?.target_platform === 'web');
      const isBackend = lower.includes('backend') || lower.includes('rest') || lower.includes('api') || (context.requirements?.target_platform === 'backend');
      const platform = isBackend ? 'backend' : (isWeb ? 'web' : 'android');

      const mockArch = {
        platform,
        language: platform === 'android' ? 'kotlin' : 'javascript',
        framework: platform === 'android' ? 'android-jetpack-compose' : (platform === 'web' ? 'react-vite' : 'express'),
        modules: [
          { name: platform === 'android' ? 'app' : 'main', type: 'application', description: 'Core application module', dependencies: [] }
        ],
        data_layer: {
          strategy: 'local_persistence',
          storage: platform === 'android' ? 'Room / StateFlow' : (platform === 'web' ? 'localStorage' : 'SQLite / In-Memory'),
          schema_details: 'Entity relations with repository pattern'
        },
        backend_strategy: {
          type: platform === 'backend' ? 'rest_api' : 'standalone_client',
          api_protocol: 'http_rest',
          endpoints: platform === 'backend' ? [
            { path: '/api/v1/items', method: 'GET', description: 'List items' },
            { path: '/api/v1/items', method: 'POST', description: 'Create item' }
          ] : []
        },
        ai_strategy: { enabled: false, provider: 'none', models: [] },
        auth_strategy: { enabled: lower.includes('auth'), provider: 'local_session' },
        security_requirements: ['No plain-text credentials', 'Input sanitization'],
        build_configuration: {
          tool: platform === 'android' ? 'gradle' : 'npm',
          target_version: platform === 'android' ? '34' : 'node-20',
          build_command: platform === 'android' ? (process.platform === 'win32' ? '.\\gradlew.bat assembleDebug' : './gradlew assembleDebug') : 'npm run build',
          test_command: platform === 'android' ? (process.platform === 'win32' ? '.\\gradlew.bat testDebugUnitTest' : './gradlew testDebugUnitTest') : 'npm test'
        },
        decisions: [
          { id: 'D001', decision: `Adopt ${platform} standard architecture`, reason: 'Verified toolchain compatibility', date: new Date().toISOString() }
        ]
      };

      if (schemaValidator) schemaValidator(mockArch);
      return mockArch;
    }

    // 3. UX Plan stage
    if (stage === 'ux_plan' || systemPrompt.includes('Lead UX/UI Architect')) {
      const isBackend = lower.includes('backend') || lower.includes('rest') || lower.includes('api') || (context.architecture?.platform === 'backend');
      const mockUx = {
        navigation_structure: {
          pattern: isBackend ? 'HeadlessApi' : 'SingleActivityWithComposableScreens',
          root_screen: isBackend ? 'none' : 'SCR01_MAIN',
          routes: isBackend ? [] : ['main', 'details']
        },
        screens: isBackend ? [] : [
          {
            id: 'SCR01_MAIN',
            name: 'MainScreen',
            purpose: 'Primary application workspace',
            components: [
              { name: 'AppHeader', type: 'Header', description: 'Application header', interaction: 'static' },
              { name: 'PrimaryList', type: 'List', description: 'Items list view', interaction: 'tap item' }
            ],
            states: {
              initial: 'Shows list of items',
              loading: 'Circular progress spinner',
              empty: 'Helpful empty state',
              error: 'Error snackbar'
            }
          }
        ],
        user_flows: [
          {
            name: isBackend ? 'API Request Flow' : 'Main Action Flow',
            trigger: isBackend ? 'HTTP Request' : 'User tap',
            steps: ['Trigger action', 'Process state', 'Update UI / Return Response'],
            expected_outcome: 'Success state'
          }
        ],
        visual_theme: {
          color_palette: {
            primary: '#6750A4',
            onPrimary: '#FFFFFF',
            background: '#FEF7FF',
            surface: '#FEF7FF'
          },
          typography: 'Standard scale',
          dark_mode_support: true
        },
        accessibility_considerations: ['48dp touch targets', 'Semantic descriptions']
      };

      if (schemaValidator) schemaValidator(mockUx);
      return mockUx;
    }

    // 4. Task Planner stage
    if (stage === 'task_planner' || systemPrompt.includes('Lead Implementation Planner')) {
      const isWeb = lower.includes('web') || lower.includes('expense') || (context.architecture?.platform === 'web');
      const isBackend = lower.includes('backend') || lower.includes('rest') || lower.includes('api') || (context.architecture?.platform === 'backend');
      const target = isBackend ? 'backend' : (isWeb ? 'web' : 'android');

      let taskList = [];
      if (target === 'android') {
        taskList = [
          {
            id: 'T001_SCAFFOLD_ANDROID',
            type: 'scaffold',
            description: 'Initialize Android Gradle project structure and manifest',
            owner: 'android_engineer',
            dependencies: [],
            affected_files: ['build.gradle.kts', 'settings.gradle.kts', 'app/build.gradle.kts', 'app/src/main/AndroidManifest.xml'],
            verification: { criteria: ['Build configuration files exist'] }
          },
          {
            id: 'T002_DOMAIN_MODELS',
            type: 'domain_logic',
            description: 'Implement domain models and state repository',
            owner: 'android_engineer',
            dependencies: ['T001_SCAFFOLD_ANDROID'],
            affected_files: ['app/src/main/java/com/jarvis/app/domain/Models.kt'],
            verification: { criteria: ['Domain entities compile'] }
          },
          {
            id: 'T003_COMPOSE_UI',
            type: 'ui_implementation',
            description: 'Implement Jetpack Compose UI screens and theme',
            owner: 'android_engineer',
            dependencies: ['T002_DOMAIN_MODELS'],
            affected_files: ['app/src/main/java/com/jarvis/app/ui/MainScreen.kt', 'app/src/main/java/com/jarvis/app/MainActivity.kt'],
            verification: { criteria: ['UI binds to ViewModel'] }
          },
          {
            id: 'T004_UNIT_TESTS',
            type: 'testing',
            description: 'Implement unit tests for domain logic',
            owner: 'qa_test_engineer',
            dependencies: ['T003_COMPOSE_UI'],
            affected_files: ['app/src/test/java/com/jarvis/app/DomainLogicTest.kt'],
            verification: { criteria: ['Unit tests pass'] }
          },
          {
            id: 'T005_BUILD_AND_PACKAGE',
            type: 'build',
            description: 'Execute gradle build and package APK',
            owner: 'build_release_engineer',
            dependencies: ['T004_UNIT_TESTS'],
            affected_files: [],
            verification: { criteria: ['APK generated on disk'] }
          },
          {
            id: 'T006_GATE_VERIFICATION',
            type: 'verification',
            description: 'Run verification gates',
            owner: 'master_orchestrator',
            dependencies: ['T005_BUILD_AND_PACKAGE'],
            affected_files: ['state/artifacts/verification_report.json'],
            verification: { criteria: ['Gates evaluate'] }
          }
        ];
      } else if (target === 'web') {
        taskList = [
          {
            id: 'T001_SCAFFOLD_WEB',
            type: 'scaffold',
            description: 'Initialize Vite React project structure and package.json',
            owner: 'frontend_engineer',
            dependencies: [],
            affected_files: ['package.json', 'vite.config.js', 'index.html'],
            verification: { criteria: ['package.json exists'] }
          },
          {
            id: 'T002_WEB_COMPONENTS',
            type: 'ui_implementation',
            description: 'Implement React application components and state',
            owner: 'frontend_engineer',
            dependencies: ['T001_SCAFFOLD_WEB'],
            affected_files: ['src/App.jsx', 'src/components/ExpenseTracker.jsx'],
            verification: { criteria: ['Components compile'] }
          },
          {
            id: 'T003_WEB_TESTS',
            type: 'testing',
            description: 'Implement Vitest unit tests',
            owner: 'qa_test_engineer',
            dependencies: ['T002_WEB_COMPONENTS'],
            affected_files: ['tests/App.test.jsx'],
            verification: { criteria: ['npm test passes'] }
          },
          {
            id: 'T004_WEB_BUILD',
            type: 'build',
            description: 'Build production web bundle',
            owner: 'build_release_engineer',
            dependencies: ['T003_WEB_TESTS'],
            affected_files: [],
            verification: { criteria: ['dist bundle created'] }
          }
        ];
      } else {
        // Backend API
        taskList = [
          {
            id: 'T001_SCAFFOLD_API',
            type: 'scaffold',
            description: 'Initialize Express REST API structure and dependencies',
            owner: 'backend_engineer',
            dependencies: [],
            affected_files: ['package.json', 'src/server.js'],
            verification: { criteria: ['package.json exists'] }
          },
          {
            id: 'T002_API_ROUTES_AND_CRUD',
            type: 'api',
            description: 'Implement CRUD controllers and routing',
            owner: 'backend_engineer',
            dependencies: ['T001_SCAFFOLD_API'],
            affected_files: ['src/routes/books.js', 'src/models/book.js'],
            verification: { criteria: ['Routes defined'] }
          },
          {
            id: 'T003_API_TESTS',
            type: 'testing',
            description: 'Implement integration tests for API endpoints',
            owner: 'qa_test_engineer',
            dependencies: ['T002_API_ROUTES_AND_CRUD'],
            affected_files: ['tests/books.test.js'],
            verification: { criteria: ['API tests pass'] }
          }
        ];
      }

      return { tasks: taskList };
    }

    // 5. Code Generation / Safe File Patching
    if (systemPrompt.includes('Senior Software Engineer') || lower.includes('current task')) {
      const taskFiles = context.task?.affected_files || ['src/generated.txt'];
      const changes = taskFiles.map(filePath => ({
        path: filePath,
        operation: 'create',
        content: `// Generated implementation for ${filePath}\n// Target task: ${context.task?.id || 'TASK'}\n`
      }));

      return {
        changes,
        summary: `Implemented task ${context.task?.id || 'TASK'}`
      };
    }

    // 6. Debug Recovery
    if (systemPrompt.includes('Autonomous Debugging Engineer') || lower.includes('failure details')) {
      return {
        root_cause: 'Simulated bug identified in build / test execution',
        changes: [
          {
            path: 'src/fix.txt',
            operation: 'create',
            content: '// Corrected code patch applied\n'
          }
        ],
        fix_summary: 'Applied targeted novel code repair'
      };
    }

    return { status: 'mock_success', prompt_snippet: userPrompt.slice(0, 50) };
  }

  async generateText({ systemPrompt, userPrompt, context = {} }) {
    return `[MockAIProvider Output for: ${userPrompt.slice(0, 80)}]`;
  }
}
