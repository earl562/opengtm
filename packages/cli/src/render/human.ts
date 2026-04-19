import type { OpenGtmCliParsed } from "../parse.js";

type CountMap = Record<string, number>;

interface ResearchRenderResult {
	workItem?: { ownerLane?: string; goal?: string };
	traceId?: string;
	traceStatus?: string;
	logFilePath?: string;
	artifactId?: string;
	artifactPath?: string;
	memoryId?: string;
		summary?: {
			lane?: string;
			workflowState?: string;
			autonomyMode?: string;
			connector?: { provider?: string; family?: string; status?: string };
		artifactsCreated?: number;
		memoryUpdated?: number;
		nextAction?: string;
	};
}

interface BuildRenderResult {
	workItem?: { ownerLane?: string; goal?: string; riskLevel?: string };
	approvalRequestId?: string;
	traceId?: string;
	traceStatus?: string;
	logFilePath?: string;
		summary?: {
			lane?: string;
			workflowState?: string;
			autonomyMode?: string;
			approvalState?: string;
		riskLevel?: string;
		nextAction?: string;
	};
}

interface SmokeScenarioRenderResult {
	name: string;
	lane?: string;
	workflowState?: string;
	connectorStatus?: string | null;
	approvalCount?: number;
	omittedPromptSections?: string[];
}

interface SmokeRenderResult {
	harness?: string;
	scenarioCount?: number;
	approvalCount?: number;
	connectorStatusSummary?: CountMap;
	nextAction?: string;
	scenarios?: SmokeScenarioRenderResult[];
}

interface ApprovalRenderResult {
	approvals?: Array<{
		id?: string;
		lane?: string;
		status?: string;
		target?: string;
	}>;
	action?: "approve" | "deny";
	approval?: { id?: string; lane?: string; status?: string; target?: string };
	workItem?: { id?: string; title?: string; status?: string };
	trace?: { id?: string; status?: string; logFilePath?: string | null };
	artifact?: { id?: string; path?: string | null; title?: string };
	summary?: {
		total?: number;
		pending?: number;
		approved?: number;
		denied?: number;
		workflowState?: string;
		workItemState?: string;
		approvalState?: string;
		nextAction?: string;
	};
}

interface TraceRenderResult {
	traces?: Array<{
		id?: string;
		lane?: string;
		status?: string;
		logFilePath?: string | null;
	}>;
	trace?: {
		id?: string;
		lane?: string;
		status?: string;
		logFilePath?: string | null;
		workflowId?: string | null;
		persona?: string | null;
		fixtureSetId?: string | null;
		debugBundlePath?: string | null;
	};
	workItem?: { id?: string; goal?: string; status?: string };
	feedback?: Array<{ id?: string; action?: string; actor?: string; message?: string }>;
	summary?: {
		total?: number;
		awaitingApproval?: number;
		completed?: number;
		failed?: number;
		feedbackCount?: number;
		nextAction?: string;
	};
}

interface WorkflowRenderResult {
	workflows?: Array<{
		id?: string;
		name?: string;
		lane?: string;
		persona?: string;
		requiresApproval?: boolean;
		supportTier?: string;
		isCanonical?: boolean;
	}>;
	workflow?: {
		id?: string;
		name?: string;
		lane?: string;
		persona?: string;
		fixtureSetId?: string;
		supportTier?: string;
		isCanonical?: boolean;
	};
	workflowRun?: { id?: string; status?: string };
	traceId?: string | null;
	logFilePath?: string | null;
	approvalRequestId?: string | null;
	artifactId?: string | null;
	artifactPath?: string | null;
	workflowState?: string;
	supportTier?: string;
	isCanonical?: boolean;
	canonicalScenarioId?: string | null;
	nextAction?: string;
	summary?: {
		total?: number;
		byLane?: CountMap;
		bySupportTier?: CountMap;
		canonicalScenarioId?: string;
		canonicalScenarioLabel?: string;
	};
}

interface FeedbackRenderResult {
	feedback?: Array<{
		id?: string;
		action?: string;
		actor?: string;
		traceId?: string;
		message?: string;
	}> | {
		id?: string;
		action?: string;
		actor?: string;
		traceId?: string;
		message?: string;
	};
	summary?: { total?: number; byAction?: CountMap; nextAction?: string };
	trace?: { id?: string; status?: string };
}

interface EvalRenderResult {
	suite?: string;
	pass?: boolean;
	results?: Array<{
		toggleSet?: Record<string, boolean>;
		deltaTotalScore?: number;
		status?: string;
		approvalsRequested?: number;
		errorCount?: number;
	}>;
	scenarios?: Array<{
		name?: string;
		status?: string;
		connectorStatus?: string | null;
		approvalCount?: number;
	}>;
	baselineScore?: number;
	scenarioCount?: number;
	canonicalScenarioId?: string;
	thresholds?: CountMap;
	dimensions?: CountMap;
	observedDeltas?: Record<string, number | null>;
}

interface ArtifactRenderResult {
	artifacts?: Array<{
		id?: string;
		lane?: string;
		title?: string;
		kind?: string;
		traceRef?: string;
	}>;
	summary?: { total?: number; byLane?: CountMap };
}

interface MemoryRenderResult {
	memory?: Array<{
		id?: string;
		memoryType?: string;
		scope?: string;
		contentRef?: string;
	}>;
	summary?: {
		total?: number;
		working?: number;
		episodic?: number;
		semantic?: number;
	};
}

interface ConnectorRenderResult {
	connectors?: Array<{ provider?: string; family?: string }>;
	summary?: { total?: number; families?: string[] };
}

interface DaemonRenderResult {
	status?: string;
	workspace?: string | null;
	initiative?: string | null;
	laneSummary?: CountMap;
	traceStatusSummary?: CountMap;
	approvalStatusSummary?: CountMap;
	counts?: {
		workItems?: number;
		traces?: number;
		approvals?: number;
		feedback?: number;
		artifacts?: number;
		memory?: number;
	};
}

function section(title: string, lines: string[]): string {
	return [
		title,
		...lines.flatMap((line) => line.split("\n").map((part) => `  ${part}`)),
	].join("\n");
}

function bulletList(items: string[], empty = "none"): string {
	if (items.length === 0) {
		return empty;
	}

	return items.map((item) => `• ${item}`).join("\n");
}

function formatCountMap(summary: CountMap | undefined): string[] {
	if (!summary || Object.keys(summary).length === 0) {
		return ["none"];
	}

	return Object.entries(summary)
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([key, count]) => `${key}: ${count}`);
}

function formatReference(
	label: string,
	value: string | null | undefined,
): string {
	return `${label}: ${value || "none"}`;
}

function renderResearch(result: ResearchRenderResult): string {
	const summary = result.summary ?? {};
	return [
		"OpenGTM research lane",
		section("Operator summary", [
			`lane: ${summary.lane || result.workItem?.ownerLane || "research"}`,
			`workflow state: ${summary.workflowState || result.traceStatus || "completed"}`,
			`autonomy: ${summary.autonomyMode || "off"}`,
			`goal: ${result.workItem?.goal || "unknown"}`,
			`connector: ${summary.connector?.provider || "unknown"} / ${summary.connector?.family || "unknown"} (${summary.connector?.status || "unknown"})`,
			`artifacts created: ${summary.artifactsCreated ?? 0}`,
			`memory updated: ${summary.memoryUpdated ?? 0}`,
		]),
		section("References", [
			formatReference("trace", result.traceId),
			formatReference("log", result.logFilePath),
			formatReference("artifact", result.artifactId),
			formatReference("artifact path", result.artifactPath),
			formatReference("memory", result.memoryId),
		]),
		section("Next action", [
			summary.nextAction ||
				"Review the generated analysis and continue the workflow.",
		]),
	].join("\n\n");
}

function renderBuild(result: BuildRenderResult): string {
	const summary = result.summary ?? {};
	return [
		"OpenGTM build lane",
		section("Operator summary", [
			`lane: ${summary.lane || result.workItem?.ownerLane || "build-integrate"}`,
			`workflow state: ${summary.workflowState || result.traceStatus || "awaiting-approval"}`,
			`autonomy: ${summary.autonomyMode || "off"}`,
			`goal: ${result.workItem?.goal || "unknown"}`,
			`approval state: ${summary.approvalState || "pending"}`,
			`risk: ${summary.riskLevel || result.workItem?.riskLevel || "unknown"}`,
		]),
		section("References", [
			formatReference("approval", result.approvalRequestId),
			formatReference("trace", result.traceId),
			formatReference("log", result.logFilePath),
		]),
		section("Next action", [
			summary.nextAction ||
				"Resolve the pending approval before build execution continues.",
		]),
	].join("\n\n");
}

function renderSmoke(result: SmokeRenderResult): string {
	const scenarios = Array.isArray(result.scenarios) ? result.scenarios : [];
	return [
		"OpenGTM smoke harness",
		section("Operator summary", [
			`harness: ${result.harness || "integrated-runtime-smoke"}`,
			`scenarios: ${result.scenarioCount ?? scenarios.length}`,
			`approval requests: ${result.approvalCount ?? 0}`,
			`connector outcomes: ${formatCountMap(result.connectorStatusSummary).join(", ")}`,
		]),
		section(
			"Scenario status",
			scenarios.map((scenario) => {
				const omitted = scenario.omittedPromptSections?.length
					? ` | omitted: ${scenario.omittedPromptSections.join(", ")}`
					: "";
				return `${scenario.name} — lane ${scenario.lane || "unknown"}, state ${scenario.workflowState || "unknown"}, connector ${scenario.connectorStatus || "none"}, approvals ${scenario.approvalCount ?? 0}${omitted}`;
			}),
		),
		section("Next action", [
			result.nextAction ||
				"Use this smoke harness to confirm runtime behavior.",
		]),
	].join("\n\n");
}

function renderApprovals(result: ApprovalRenderResult): string {
	const approvals = Array.isArray(result.approvals) ? result.approvals : [];
	const resolution =
		result.action && result.approval
			? [
					section("Resolution", [
						`action: ${result.action}`,
						`approval: ${result.approval.id || "unknown"} / ${result.summary?.approvalState || result.approval.status || "unknown"}`,
						`work item: ${result.workItem?.id || "unknown"} / ${result.summary?.workItemState || result.workItem?.status || "unknown"}`,
						`trace: ${result.trace?.id || "unknown"} / ${result.summary?.workflowState || result.trace?.status || "unknown"}`,
					]),
					section("References", [
						formatReference("trace log", result.trace?.logFilePath),
						formatReference("artifact", result.artifact?.id),
						formatReference("artifact path", result.artifact?.path),
					]),
				]
			: [];

	return [
		"Approval queue",
		section("Operator summary", [
			`total: ${result.summary?.total ?? approvals.length}`,
			`pending: ${result.summary?.pending ?? 0}`,
			`approved: ${result.summary?.approved ?? 0}`,
			`denied: ${result.summary?.denied ?? 0}`,
		]),
		...resolution,
		section(
			"Requests",
			approvals.length === 0
				? ["none"]
				: approvals.map(
						(approval) =>
							`${approval.id || "unknown"} — ${approval.lane || "unknown"} / ${approval.status || "unknown"} / ${approval.target || "unknown"}`,
					),
		),
		section("Next action", [
			result.summary?.nextAction ||
				"Review the approval queue and resolve pending requests.",
		]),
	].join("\n\n");
}

function renderTraces(result: TraceRenderResult): string {
	if (result.trace) {
		const feedback = Array.isArray(result.feedback) ? result.feedback : [];
		return [
			"Trace detail",
			section("Trace", [
				`id: ${result.trace.id || "unknown"}`,
				`lane: ${result.trace.lane || "unknown"}`,
				`status: ${result.trace.status || "unknown"}`,
				`workflow: ${result.trace.workflowId || "none"}`,
				`persona: ${result.trace.persona || "none"}`,
				`fixture set: ${result.trace.fixtureSetId || "none"}`,
			]),
			section("References", [
				formatReference("log", result.trace.logFilePath),
				formatReference("debug bundle", result.trace.debugBundlePath),
				formatReference("work item", result.workItem?.id),
			]),
			section(
				"Feedback",
				feedback.length === 0
					? ["none"]
					: feedback.map(
							(item) =>
								`${item.id || "unknown"} — ${item.action || "unknown"} by ${item.actor || "unknown"} / ${item.message || "no message"}`,
						),
			),
			section("Next action", [
				result.summary?.nextAction ||
					"Replay this trace or continue the linked workflow.",
			]),
		].join("\n\n");
	}

	const traces = Array.isArray(result.traces) ? result.traces : [];
	return [
		"Run traces",
		section("Operator summary", [
			`total: ${result.summary?.total ?? traces.length}`,
			`awaiting approval: ${result.summary?.awaitingApproval ?? 0}`,
			`completed: ${result.summary?.completed ?? 0}`,
			`failed: ${result.summary?.failed ?? 0}`,
		]),
		section(
			"Recent traces",
			traces.length === 0
				? ["none"]
				: traces.map(
						(trace) =>
							`${trace.id || "unknown"} — lane ${trace.lane || "unknown"} / ${trace.status || "unknown"} / log ${trace.logFilePath || "none"}`,
					),
		),
	].join("\n\n");
}

function renderWorkflow(result: WorkflowRenderResult): string {
	if (Array.isArray(result.workflows)) {
		return [
			"Workflow catalog",
			section("Operator summary", [
				`total: ${result.summary?.total ?? result.workflows.length}`,
				`lanes: ${formatCountMap(result.summary?.byLane).join(", ")}`,
				`support tiers: ${formatCountMap(result.summary?.bySupportTier).join(", ")}`,
				`canonical scenario: ${result.summary?.canonicalScenarioId || "none"}${result.summary?.canonicalScenarioLabel ? ` — ${result.summary.canonicalScenarioLabel}` : ""}`,
			]),
			section(
				"Workflows",
				result.workflows.map(
					(workflow) =>
						`${workflow.id || "unknown"} — ${workflow.name || "unknown"} / ${workflow.lane || "unknown"} / ${workflow.persona || "unknown"} / approval ${workflow.requiresApproval ? "required" : "not-required"} / tier ${workflow.supportTier || "unknown"}${workflow.isCanonical ? " / canonical" : ""}`,
				),
			),
		].join("\n\n");
	}

	return [
		"Workflow run",
		section("Operator summary", [
			`workflow: ${result.workflow?.id || "unknown"} / ${result.workflow?.name || "unknown"}`,
			`lane: ${result.workflow?.lane || "unknown"}`,
			`persona: ${result.workflow?.persona || "unknown"}`,
			`fixture set: ${result.workflow?.fixtureSetId || "unknown"}`,
			`support tier: ${result.supportTier || result.workflow?.supportTier || "unknown"}${result.isCanonical || result.workflow?.isCanonical ? " / canonical" : ""}`,
			`canonical scenario: ${result.canonicalScenarioId || "none"}`,
			`workflow run: ${result.workflowRun?.id || "unknown"} / ${result.workflowRun?.status || result.workflowState || "unknown"}`,
		]),
		section("References", [
			formatReference("trace", result.traceId),
			formatReference("log", result.logFilePath),
			formatReference("approval", result.approvalRequestId),
			formatReference("artifact", result.artifactId),
			formatReference("artifact path", result.artifactPath),
		]),
		section("Next action", [
			result.nextAction || "Review the workflow outputs and continue the GTM run.",
		]),
	].join("\n\n");
}

function renderFeedback(result: FeedbackRenderResult): string {
	const items = Array.isArray(result.feedback)
		? result.feedback
		: result.feedback
			? [result.feedback]
			: [];
	return [
		"Feedback ledger",
		section("Operator summary", [
			`total: ${result.summary?.total ?? items.length}`,
			`by action: ${formatCountMap(result.summary?.byAction).join(", ")}`,
			formatReference("trace", result.trace?.id),
		]),
		section(
			"Entries",
			items.length === 0
				? ["none"]
				: items.map(
						(item) =>
							`${item.id || "unknown"} — ${item.action || "unknown"} by ${item.actor || "unknown"} / trace ${item.traceId || "unknown"} / ${item.message || "no message"}`,
					),
		),
		section("Next action", [
			result.summary?.nextAction || "Review the feedback linked to the workflow traces.",
		]),
	].join("\n\n");
}

function renderEvals(result: EvalRenderResult): string {
	const scenarios = Array.isArray(result.scenarios) ? result.scenarios : [];
	const results = Array.isArray(result.results) ? result.results : [];

	return [
		"Evaluation suite",
		section("Operator summary", [
			`suite: ${result.suite || "unknown"}`,
			`pass: ${typeof result.pass === "boolean" ? String(result.pass) : "n/a"}`,
			`canonical scenario: ${result.canonicalScenarioId || "n/a"}`,
			`baseline score: ${result.baselineScore ?? "n/a"}`,
			`scenario count: ${result.scenarioCount ?? scenarios.length}`,
			`result count: ${results.length}`,
		]),
		...(result.dimensions
			? [
					section(
						"Dimensions",
						Object.entries(result.dimensions).map(
							([name, score]) =>
								`${name}: ${score}${result.thresholds?.[name] !== undefined ? ` / threshold ${result.thresholds[name]}` : ""}`,
						),
					),
				]
			: []),
		...(result.observedDeltas
			? [
					section(
						"Ablation deltas",
						Object.entries(result.observedDeltas).map(
							([name, value]) => `${name}: ${value ?? "n/a"}`,
						),
					),
				]
			: []),
		...(scenarios.length > 0
			? [
					section(
						"Scenarios",
						scenarios.map(
							(scenario) =>
								`${scenario.name || "unknown"} — ${scenario.status || "unknown"} / connector ${scenario.connectorStatus || "none"} / approvals ${scenario.approvalCount ?? 0}`,
						),
					),
				]
			: []),
		...(results.length > 0
			? [
					section(
						"Ablations",
						results.map(
							(item) =>
								`${JSON.stringify(item.toggleSet || {})} — delta ${item.deltaTotalScore ?? 0} / status ${item.status || "unknown"} / approvals ${item.approvalsRequested ?? 0} / errors ${item.errorCount ?? 0}`,
						),
					),
				]
			: []),
	].join("\n\n");
}

function renderArtifacts(result: ArtifactRenderResult): string {
	const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
	return [
		"Artifacts",
		section("Operator summary", [
			`total: ${result.summary?.total ?? artifacts.length}`,
			`lanes: ${formatCountMap(result.summary?.byLane).join(", ")}`,
		]),
		section(
			"Artifact refs",
			artifacts.length === 0
				? ["none"]
				: artifacts.map(
						(artifact) =>
							`${artifact.id || "unknown"} — ${artifact.lane || "unknown"} / ${artifact.title || artifact.kind || "artifact"} / ${artifact.traceRef || "no trace"}`,
					),
		),
	].join("\n\n");
}

function renderMemory(result: MemoryRenderResult): string {
	const memory = Array.isArray(result.memory) ? result.memory : [];
	return [
		"Memory records",
		section("Operator summary", [
			`total: ${result.summary?.total ?? memory.length}`,
			`working: ${result.summary?.working ?? 0}`,
			`episodic: ${result.summary?.episodic ?? 0}`,
			`semantic: ${result.summary?.semantic ?? 0}`,
		]),
		section(
			"Memory refs",
			memory.length === 0
				? ["none"]
				: memory.map(
						(record) =>
							`${record.id || "unknown"} — ${record.memoryType || "unknown"} / ${record.scope || "unknown"} / ${record.contentRef || "none"}`,
					),
		),
	].join("\n\n");
}

function renderConnectors(result: ConnectorRenderResult): string {
	const connectors = Array.isArray(result.connectors) ? result.connectors : [];
	return [
		"Connector inventory",
		section("Operator summary", [
			`total: ${result.summary?.total ?? connectors.length}`,
			`families: ${bulletList(result.summary?.families ?? [])}`,
		]),
		section(
			"Connectors",
			connectors.length === 0
				? ["none"]
				: connectors.map(
						(connector) =>
							`${connector.provider || "unknown"} — family ${connector.family || "unknown"}`,
					),
		),
	].join("\n\n");
}

function renderDaemonStatus(result: DaemonRenderResult): string {
	return [
		"Daemon status",
		section("Operator summary", [
			`status: ${result.status || "unknown"}`,
			`workspace: ${result.workspace || "none"}`,
			`initiative: ${result.initiative || "none"}`,
		]),
		section("Lane summary", formatCountMap(result.laneSummary)),
		section("Trace states", formatCountMap(result.traceStatusSummary)),
		section("Approval states", formatCountMap(result.approvalStatusSummary)),
		section("Inventory", [
			`work items: ${result.counts?.workItems ?? 0}`,
			`traces: ${result.counts?.traces ?? 0}`,
			`approvals: ${result.counts?.approvals ?? 0}`,
			`feedback: ${result.counts?.feedback ?? 0}`,
			`artifacts: ${result.counts?.artifacts ?? 0}`,
			`memory: ${result.counts?.memory ?? 0}`,
		]),
	].join("\n\n");
}

export function renderHumanOutput(
	parsed: OpenGtmCliParsed,
	result: unknown,
): string {
	if (parsed.command === "run" && parsed.subcommand === "research") {
		return renderResearch((result ?? {}) as ResearchRenderResult);
	}

	if (parsed.command === "run" && parsed.subcommand === "build") {
		return renderBuild((result ?? {}) as BuildRenderResult);
	}

	if (
		(parsed.command === "run" && parsed.subcommand === "opengtm") ||
		parsed.command === "opengtm"
	) {
		return renderSmoke((result ?? {}) as SmokeRenderResult);
	}

	if (parsed.command === "approvals") {
		return renderApprovals((result ?? {}) as ApprovalRenderResult);
	}

	if (parsed.command === "traces" && parsed.subcommand === "list") {
		return renderTraces((result ?? {}) as TraceRenderResult);
	}

	if (parsed.command === "traces" && parsed.subcommand === "show") {
		return renderTraces((result ?? {}) as TraceRenderResult);
	}

	if (parsed.command === "traces" && parsed.subcommand === "replay") {
		return renderWorkflow((result ?? {}) as WorkflowRenderResult);
	}

	if (parsed.command === "workflow" || (parsed.command === "run" && parsed.subcommand === "workflow")) {
		return renderWorkflow((result ?? {}) as WorkflowRenderResult);
	}

	if (parsed.command === "feedback") {
		return renderFeedback((result ?? {}) as FeedbackRenderResult);
	}

	if (parsed.command === "evals" && parsed.subcommand === "run") {
		return renderEvals((result ?? {}) as EvalRenderResult);
	}

	if (parsed.command === "artifacts" && parsed.subcommand === "list") {
		return renderArtifacts((result ?? {}) as ArtifactRenderResult);
	}

	if (parsed.command === "memory" && parsed.subcommand === "list") {
		return renderMemory((result ?? {}) as MemoryRenderResult);
	}

	if (parsed.command === "connector" && parsed.subcommand === "list") {
		return renderConnectors((result ?? {}) as ConnectorRenderResult);
	}

	if (parsed.command === "daemon" && parsed.subcommand === "status") {
		return renderDaemonStatus((result ?? {}) as DaemonRenderResult);
	}

	return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}
