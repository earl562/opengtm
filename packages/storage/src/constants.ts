export const OPEN_GTM_STORAGE_TABLES = [
  'workspaces',
  'initiatives',
  'initiative_summaries',
  'accounts',
  'contacts',
  'journeys',
  'inbox_items',
  'analytics_snapshots',
  'conversation_threads',
  'system_records',
  'reconciliation_reports',
  'work_items',
  'run_attempts',
  'artifacts',
  'memory_records',
  'skills',
  'connectors',
  'connector_sessions',
  'policy_decisions',
  'approval_requests',
  'feedback_records',
  'audit_events',
  'handoff_packets',
  'run_traces',
  'workflows',
  'workflow_runs'
] as const

export type OpenGtmStorageTable = typeof OPEN_GTM_STORAGE_TABLES[number]

export const OPEN_GTM_STORAGE_SCHEMA_VERSION = '1'
