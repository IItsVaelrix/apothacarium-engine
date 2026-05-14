import { z } from 'zod';

// --- Agent Schemas ---

export const AgentRole = z.enum(['ui', 'backend', 'qa']);

export const RegisterAgentSchema = z.object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(128),
    role: AgentRole,
    framework_origin: z.string().max(64).optional().default('native'),
    capabilities: z.array(z.string()).default([]),
    metadata: z.any().optional(),
});

export const HeartbeatSchema = z.object({
    status: z.enum(['online', 'busy', 'offline']).default('online'),
    current_task_id: z.string().nullable().optional(),
});

// --- Task Schemas ---

export const TaskStatus = z.enum([
    'backlog', 'assigned', 'in_progress', 'review', 'testing', 'done',
]);

export const CreateTaskSchema = z.object({
    title: z.string().min(1).max(256),
    description: z.string().max(4096).optional(),
    note: z.string().max(4096).optional(), // Initial note from creator
    priority: z.number().int().min(0).max(3).default(1),
    file_paths: z.array(z.string()).default([]),
    depends_on: z.array(z.string()).default([]),
    created_by: z.string().default('human'),
    pipeline_run_id: z.string().optional(),
});

export const UpdateTaskSchema = z.object({
    title: z.string().min(1).max(256).optional(),
    description: z.string().max(4096).optional(),
    status: TaskStatus.optional(),
    priority: z.number().int().min(0).max(3).optional(),
    result: z.any().optional(),
    note: z.string().min(1).max(4096), // REQUIRED: Every update must have a note (call center style)
});

export const AssignTaskSchema = z.object({
    agent_id: z.string().min(1),
    override: z.boolean().default(false),
});

export const TaskAssignmentPreflightQuerySchema = z.object({
    agent_id: z.string().min(1).max(64),
});

// --- File Lock Schemas ---

export const AcquireLockSchema = z.object({
    file_path: z.string().min(1),
    agent_id: z.string().min(1),
    task_id: z.string().optional(),
    ttl_minutes: z.number().int().min(1).max(480).default(30),
});

// --- Pipeline Schemas ---

export const PipelineType = z.enum([
    'code_review_test', 'schema_change', 'bug_fix', 'ui_feature',
]);

export const CreatePipelineSchema = z.object({
    pipeline_type: PipelineType,
    trigger_task_id: z.string().optional(),
});

export const AdvancePipelineSchema = z.object({
    result: z.any().default({}),
});

export const FailPipelineSchema = z.object({
    reason: z.string().min(1).max(1024),
});

// --- Query Schemas (pagination + strict list filters) ---

export const MAX_PAGE_LIMIT = 100;

export const PaginationQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});

export const ListTasksQuerySchema = PaginationQuerySchema.extend({
    status: TaskStatus.optional(),
    agent: z.string().min(1).max(64).optional(),
    priority: z.coerce.number().int().min(0).max(3).optional(),
});

export const PipelineRunStatus = z.enum([
    'pending', 'running', 'completed', 'failed',
]);

export const ListPipelinesQuerySchema = PaginationQuerySchema.extend({
    status: PipelineRunStatus.optional(),
});

export const ListActivityQuerySchema = PaginationQuerySchema.extend({
    agent: z.string().min(1).max(64).optional(),
    action: z.string().min(1).max(128).optional(),
});

export const LockCheckQuerySchema = z.object({
    path: z.string().min(1).max(1024),
});

// --- Bug Report Schemas ---

export const BugStatus = z.enum([
    'new', 'triaged', 'assigned', 'in_progress', 'fixed', 'verified', 'closed', 'duplicate', 'archived',
]);

export const BugSeverity = z.enum(['INFO', 'WARN', 'CRIT', 'FATAL']);

export const BugSourceType = z.enum(['human', 'runtime', 'qa', 'pipeline', 'agent']);

export const CreateBugReportSchema = z.object({
    title: z.string().min(1).max(256),
    summary: z.string().max(4096).optional(),
    priority: z.number().int().min(0).max(3).default(1),
    source_type: BugSourceType,
    source_ref_id: z.string().max(128).optional(),
    reporter_agent_id: z.string().max(64).optional(),
    assigned_agent_id: z.string().max(64).optional(),
    category: z.string().max(64).optional(),
    severity: BugSeverity.optional(),
    module_id: z.string().max(64).optional(),
    error_code_hex: z.string().max(16).optional(),
    bytecode: z.string().max(16384).optional(),
    solution_bytecode: z.string().max(16384).optional(),
    solution_ledger_status: z.enum(['pending', 'active', 'flagged']).optional(),
    corroborating_agents: z.array(z.string()).optional(),
    observed_behavior: z.string().max(4096).optional(),
    expected_behavior: z.string().max(4096).optional(),
    repro_steps: z.array(z.string()).optional(),
    environment: z.record(z.string(), z.any()).optional(),
    attachments: z.array(z.object({
        type: z.enum(['image', 'video', 'log', 'json', 'text']),
        url: z.string().optional(),
        text: z.string().optional(),
        label: z.string().optional(),
    })).default([]),
    related_task_id: z.string().max(128).optional(),
    related_pipeline_id: z.string().max(128).optional(),
    related_activity_id: z.string().max(128).optional(),
});

export const UpdateBugReportSchema = z.object({
    title: z.string().min(1).max(256).optional(),
    summary: z.string().max(4096).optional(),
    status: BugStatus.optional(),
    priority: z.number().int().min(0).max(3).optional(),
    assigned_agent_id: z.string().max(64).optional().nullable(),
    severity: BugSeverity.optional(),
    duplicate_of_bug_id: z.string().max(128).optional().nullable(),
    solution_bytecode: z.string().max(16384).optional(),
    solution_ledger_status: z.enum(['pending', 'active', 'flagged']).optional(),
    corroborating_agents: z.array(z.string()).optional(),
    observed_behavior: z.string().max(4096).optional(),
    expected_behavior: z.string().max(4096).optional(),
    repro_steps: z.array(z.string()).optional(),
});

export const ListBugsQuerySchema = PaginationQuerySchema.extend({
    status: BugStatus.optional(),
    severity: BugSeverity.optional(),
    category: z.string().optional(),
    module_id: z.string().optional(),
    source_type: BugSourceType.optional(),
    assigned_agent_id: z.string().optional(),
});

export const BytecodeParseSchema = z.object({
    bytecode: z.string().min(1).max(16384),
});

// --- Memory Schemas ---

export const SetMemorySchema = z.object({
    agent_id: z.string().min(1).optional().default('').describe('Agent ID for specific memory, or empty string for global'),
    key: z.string().min(1).max(128).describe('Unique key for the memory'),
    value: z.any().describe('Value to persist (JSON-serializable)'),
});

export const GetMemorySchema = z.object({
    agent_id: z.string().min(1).optional().default('').describe('Agent ID for specific memory, or empty string for global'),
    key: z.string().min(1).max(128).describe('Key to retrieve'),
});

// --- Messaging Schemas (Cognitive Bus) ---

export const AgentMessageSchema = z.object({
    sender_id: z.string().min(1).max(64),
    target_id: z.string().min(1).max(64).default('all'),
    glyph: z.string().max(8).optional().default('✦'),
    text: z.string().max(4096),
    bytecode: z.string().max(16384).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

export const ListMessagesQuerySchema = PaginationQuerySchema.extend({
    sender: z.string().min(1).max(64).optional(),
    target: z.string().min(1).max(64).optional(),
    since: z.string().optional(),
});


// --- Alert Schemas ---

export const IdentityPacketSchema = z.object({
    alert_id: z.string(),
    issued_at: z.number(),
    expires_at: z.number(),
    sla_ms: z.number(),
    recipient: z.object({
        id: z.string(),
        name: z.string(),
        role: AgentRole,
        capabilities: z.array(z.string()),
    }),
    sender: z.object({
        id: z.string(),
        name: z.string(),
        role: AgentRole,
    }),
    message: z.object({
        id: z.number(),
        target_id: z.string(),
        glyph: z.string(),
        text: z.string(),
        bytecode: z.string().nullable(),
        created_at: z.string(),
    }),
    respond_via: z.object({
        tool: z.string(),
        endpoint: z.string(),
    }),
});

export const AlertResponseSchema = z.object({
    payload: z.any().optional().default({}),
});

export const ListAlertsQuerySchema = PaginationQuerySchema.extend({
    agent_id: z.string().optional(),
    status: z.enum(['pending', 'acknowledged', 'expired']).optional(),
});
