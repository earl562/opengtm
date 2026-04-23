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
			generation?: { providerId?: string; model?: string; configured?: boolean };
		artifactsCreated?: number;
		memoryUpdated?: number;
		nextAction?: string;
	};
}

interface InitRenderResult {
	workspace?: { id?: string; name?: string; slug?: string };
	initiative?: { id?: string; title?: string; status?: string };
	config?: { runtimeDir?: string; workspaceRoot?: string };
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

interface OpsRenderResult {
	workItem?: { ownerLane?: string; goal?: string; riskLevel?: string };
	approvalRequestId?: string;
	traceId?: string;
	traceStatus?: string;
	logFilePath?: string;
	artifactId?: string;
	artifactPath?: string;
	summary?: {
		lane?: string;
		workflowState?: string;
		autonomyMode?: string;
		approvalState?: string;
		supportTier?: string;
		generation?: { providerId?: string; model?: string; configured?: boolean };
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
		actionSummary?: string;
	}>;
	action?: "approve" | "deny";
	approval?: { id?: string; lane?: string; status?: string; target?: string; actionSummary?: string };
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

interface DashboardRenderResult {
	kind?: string;
	title?: string;
	subtitle?: string;
	current?: {
		workspace?: string | null;
		initiative?: string | null;
		provider?: string | null;
		model?: string | null;
		sandboxProfile?: string | null;
	};
	commandGroups?: Array<{ title?: string; commands?: string[] }>;
	support?: {
		liveWorkflows?: number;
		referenceWorkflows?: number;
		providers?: number;
		sandboxProfiles?: number;
	};
	truthfulness?: string[];
	nextAction?: string;
}

interface StatusRenderResult {
	kind?: string;
	workspace?: {
		id?: string;
		name?: string;
		initiativeId?: string;
		initiativeTitle?: string;
		runtimeDir?: string;
	} | null;
	controlPlane?: {
		provider?: {
			id?: string;
			label?: string;
			configured?: boolean;
			authMode?: string;
			maskedValue?: string | null;
		};
		model?: string;
		sandbox?: {
			runtime?: string;
			available?: boolean;
			profile?: string;
		};
	};
	support?: {
		liveWorkflows?: number;
		referenceOnlyWorkflows?: number;
		builtInSkills?: number;
		builtInAgents?: number;
	};
	inventory?: {
		traces?: number;
		approvals?: number;
		feedback?: number;
		artifacts?: number;
		memory?: number;
	};
	nextAction?: string;
}

interface AuthRenderResult {
	kind?: string;
	action?: string;
	provider?: {
		id?: string;
		label?: string;
		authMode?: string;
	};
	configured?: boolean;
	backend?: string;
	maskedValue?: string | null;
	envVar?: string | null;
	accountId?: string | null;
	authUrl?: string | null;
	redirectUri?: string | null;
	nextAction?: string;
}

interface ToolsRenderResult {
	kind?: string;
	action?: string;
	primitive?: {
		name?: string;
		category?: string;
		description?: string;
		available?: boolean;
		rationale?: string;
	};
	primitives?: Array<{
		name?: string;
		category?: string;
		description?: string;
		available?: boolean;
		rationale?: string;
	}>;
	summary?: {
		total?: number;
		available?: number;
		unavailable?: number;
	};
	result?: unknown;
	nextAction?: string;
}

interface CodeRenderResult {
	kind?: string;
	goal?: string;
	output?: string;
	nextAction?: string;
}

interface ProvidersRenderResult {
	kind?: string;
	action?: string;
	currentProvider?: string;
	providers?: Array<{
		id?: string;
		label?: string;
		description?: string;
		supportTier?: string;
		authMode?: string;
		baseURL?: string | null;
		configured?: boolean;
	}>;
	nextAction?: string;
}

interface ModelsRenderResult {
	kind?: string;
	action?: string;
	provider?: {
		id?: string;
		label?: string;
	};
	currentModel?: string;
	models?: Array<{ id?: string; current?: boolean }>;
	nextAction?: string;
}

interface SandboxRenderResult {
	kind?: string;
	action?: string;
	available?: boolean;
	runtime?: string;
	currentProfile?: string;
	profiles?: Array<{
		id?: string;
		label?: string;
		description?: string;
		restrictions?: string[];
	}>;
	profile?: {
		id?: string;
		label?: string;
		description?: string;
		restrictions?: string[];
		policy?: string;
	};
	command?: string[];
	status?: string;
	stdout?: string;
	stderr?: string;
	error?: string;
	artifactId?: string | null;
	artifactPath?: string | null;
	nextAction?: string;
}

interface SkillsRenderResult {
	kind?: string;
	action?: string;
	skills?: Array<{
		id?: string;
		name?: string;
		persona?: string;
		summary?: string;
		source?: string;
	}>;
	skill?: Record<string, unknown> & {
		id?: string;
		name?: string;
		persona?: string;
		summary?: string;
		source?: string;
		path?: string;
	};
	nextAction?: string;
}

interface AgentsRenderResult {
	kind?: string;
	action?: string;
	agents?: Array<{
		id?: string;
		name?: string;
		persona?: string;
		description?: string;
		source?: string;
	}>;
	agent?: {
		id?: string;
		name?: string;
		persona?: string;
		description?: string;
		defaultModel?: string;
		recommendedSkills?: string[];
		source?: string;
		path?: string | null;
	};
	jobs?: Array<AgentJobRenderItem>;
	job?: AgentJobRenderItem;
	harness?: {
		id?: string;
		motion?: string;
		targetEntity?: string;
		status?: string;
		summary?: string;
		traceId?: string;
		artifactId?: string;
		artifactPath?: string;
		approvalRequestId?: string | null;
		coordinatorJobId?: string;
		stageCount?: number;
		principles?: string[];
	};
	summary?: {
		total?: number;
		queued?: number;
		running?: number;
		awaitingApproval?: number;
		completed?: number;
	};
	nextAction?: string;
}

interface AgentJobRenderItem {
	id?: string;
	agentType?: string;
	lane?: string;
	goal?: string;
	status?: string;
	progress?: number | null;
	summary?: string | null;
	constraints?: string[];
	requiredOutputs?: string[];
	sourceIds?: string[];
	artifactIds?: string[];
	approvalRequestId?: string | null;
	parentJobId?: string | null;
	dependsOnJobIds?: string[];
	traceId?: string | null;
	updatedAt?: string;
}

interface LearnRenderResult {
	kind?: string;
	action?: string;
	dominantWorkflow?: string;
	evidence?: {
		deniedApprovals?: number;
		reviseFeedback?: number;
		deniedFeedback?: number;
	};
	generated?: boolean;
	candidateSkillPath?: string | null;
	artifactId?: string;
	artifactPath?: string;
	nextAction?: string;
}

interface SessionAdvanceRenderState {
	runId?: string | null;
	status?: string;
	startedAt?: string | null;
	updatedAt?: string | null;
	stepsRequested?: number;
	stepsExecuted?: number;
	stopReason?: string | null;
	lastCardTitle?: string | null;
	lastCommand?: string | null;
}

interface SessionStatusRenderResult {
	kind?: string;
	session?: {
		sessionId?: string;
		status?: string;
		transcriptPath?: string;
		createdAt?: string;
		updatedAt?: string;
		lastTraceId?: string | null;
		lastApprovalRequestId?: string | null;
		lastArtifactId?: string | null;
		lastMemoryId?: string | null;
		lastWorkflowId?: string | null;
		focusEntity?: string | null;
		focusType?: string | null;
		lastIntent?: string | null;
		lastSpecialist?: string | null;
		advance?: SessionAdvanceRenderState | null;
	} | null;
	advance?: SessionAdvanceRenderState | null;
	nextAction?: string;
}

interface SessionRuntimeRenderResult {
	kind?: string;
	session?: {
		sessionId?: string;
		status?: string;
		focusEntity?: string | null;
		focusType?: string | null;
		lastIntent?: string | null;
		lastSpecialist?: string | null;
		lastWorkflowId?: string | null;
		lastTraceId?: string | null;
		advance?: SessionAdvanceRenderState | null;
		lineage?: {
			lead?: { entity?: string; checkpointId?: string; sourceArtifacts?: number } | null;
			account?: { entity?: string; checkpointId?: string; sourceArtifacts?: number } | null;
			deal?: { entity?: string; checkpointId?: string; sourceArtifacts?: number } | null;
		} | null;
	} | null;
	controlPlane?: {
		provider?: {
			id?: string;
			label?: string;
			configured?: boolean;
			model?: string;
		};
		sandbox?: {
			runtime?: string;
			available?: boolean;
			profile?: string;
		};
	};
	inventory?: {
		pendingApprovals?: number;
		totalApprovals?: number;
		traces?: number;
		latestTrace?: { id?: string; workflowId?: string | null; status?: string } | null;
	};
	leadRuntime?: {
		phase?: string | null;
		relationshipState?: string | null;
		doNotSend?: string | null;
		recommendedApproach?: string | null;
	} | null;
	accountRuntime?: {
		phase?: string | null;
	} | null;
	dealRuntime?: {
		phase?: string | null;
	} | null;
	recommendedActions?: string[];
	actionCards?: Array<{ title?: string; reason?: string; commandArgs?: string[] }>;
	nextAction?: string;
}

interface SessionLaunchRenderResult {
	kind?: string;
	requiresTty?: boolean;
	cwd?: string;
	nextAction?: string;
}

interface SessionQueryRenderResult {
	kind?: string;
	queryType?: string;
	specialist?: string;
	entity?: string | null;
	summary?: string[];
	recommendedActions?: string[];
	actionCards?: Array<{ title?: string; reason?: string; commandArgs?: string[] }>;
	traces?: Array<{ id?: string; workflowId?: string | null; status?: string }>;
	approvals?: Array<{ id?: string; status?: string; actionSummary?: string }>;
	artifacts?: Array<{ id?: string; title?: string; path?: string | null }>;
	memory?: Array<{ id?: string; memoryType?: string; path?: string }>;
	nextAction?: string;
}

interface SessionTranscriptRenderResult {
	kind?: string;
	session?: {
		sessionId?: string;
		transcriptPath?: string;
		status?: string;
	} | null;
	entries?: Array<{
		role?: string;
		content?: string;
		createdAt?: string;
	}>;
	error?: string | null;
	nextAction?: string;
}

interface SessionCompactRenderResult {
	kind?: string;
	session?: {
		sessionId?: string;
		transcriptPath?: string;
		status?: string;
	} | null;
	backupPath?: string;
	previousEntryCount?: number;
	compactedEntryCount?: number;
	summaryPreview?: string;
	error?: string | null;
	nextAction?: string;
}

interface SessionActionRenderResult {
	kind?: string;
	executed?: boolean;
	slot?: number;
	output?: string;
	nextAction?: string;
}

interface SessionCardsRenderResult {
	kind?: string;
	refreshed?: boolean;
	session?: {
		sessionId?: string;
		status?: string;
		focusEntity?: string | null;
		focusType?: string | null;
	} | null;
	actionCards?: Array<{ title?: string; reason?: string; commandArgs?: string[] }>;
	nextAction?: string;
}

interface SessionProgressRenderResult {
	kind?: string;
	session?: {
		sessionId?: string;
		status?: string;
		focusEntity?: string | null;
		focusType?: string | null;
	} | null;
	advance?: SessionAdvanceRenderState | null;
	history?: Array<{
		runId?: string;
		mode?: string;
		startedAt?: string | null;
		finishedAt?: string;
		stepsRequested?: number;
		stepsExecuted?: number;
		stopReason?: string;
		finalStatus?: string;
		lastCardTitle?: string | null;
		lastCommand?: string | null;
	}>;
	nextAction?: string;
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
		renderTerminalCard("Operator summary", [
			`lane: ${summary.lane || result.workItem?.ownerLane || "research"}`,
			`workflow state: ${summary.workflowState || result.traceStatus || "completed"}`,
			`autonomy: ${summary.autonomyMode || "off"}`,
			`goal: ${result.workItem?.goal || "unknown"}`,
			`connector: ${summary.connector?.provider || "unknown"} / ${summary.connector?.family || "unknown"} (${summary.connector?.status || "unknown"})`,
			`language model: ${summary.generation?.providerId || "none"} / ${summary.generation?.model || "n/a"} / configured ${String(summary.generation?.configured ?? false)}`,
			`artifacts created: ${summary.artifactsCreated ?? 0}`,
			`memory updated: ${summary.memoryUpdated ?? 0}`,
		]),
		renderTerminalCard("References", [
			formatReference("trace", result.traceId),
			formatReference("log", result.logFilePath),
			formatReference("artifact", result.artifactId),
			formatReference("artifact path", result.artifactPath),
			formatReference("memory", result.memoryId),
		]),
		renderTerminalCard("Next action", [
			summary.nextAction ||
				"Review the generated analysis and continue the workflow.",
		]),
	].join("\n\n");
}

function renderInit(result: InitRenderResult): string {
	return [
		"OpenGTM workspace initialized",
		renderTerminalCard("Workspace", [
			`name: ${result.workspace?.name || "unknown"}`,
			`id: ${result.workspace?.id || "unknown"}`,
			`slug: ${result.workspace?.slug || "unknown"}`,
		]),
		renderTerminalCard("Initiative", [
			`title: ${result.initiative?.title || "unknown"}`,
			`id: ${result.initiative?.id || "unknown"}`,
			`status: ${result.initiative?.status || "active"}`,
		]),
		renderTerminalCard("Runtime", [
			`dir: ${result.config?.runtimeDir || ".opengtm/runtime"}`,
			`root: ${result.config?.workspaceRoot || "unknown"}`,
			"shortcut: opengtm status",
		]),
		renderTerminalCard("Next action", [
			"Run `opengtm status` to inspect the control plane, then `opengtm workflow list` to choose a GTM workflow.",
		]),
	].join("\n\n");
}

function renderBuild(result: BuildRenderResult): string {
	const summary = result.summary ?? {};
	return [
		"OpenGTM build lane",
		renderTerminalCard("Operator summary", [
			`lane: ${summary.lane || result.workItem?.ownerLane || "build-integrate"}`,
			`workflow state: ${summary.workflowState || result.traceStatus || "awaiting-approval"}`,
			`autonomy: ${summary.autonomyMode || "off"}`,
			`goal: ${result.workItem?.goal || "unknown"}`,
			`approval state: ${summary.approvalState || "pending"}`,
			`risk: ${summary.riskLevel || result.workItem?.riskLevel || "unknown"}`,
		]),
		renderTerminalCard("References", [
			formatReference("approval", result.approvalRequestId),
			formatReference("trace", result.traceId),
			formatReference("log", result.logFilePath),
		]),
		renderTerminalCard("Next action", [
			summary.nextAction ||
				"Resolve the pending approval before build execution continues.",
		]),
	].join("\n\n");
}

function renderOps(result: OpsRenderResult): string {
	const summary = result.summary ?? {};
	return [
		"OpenGTM ops lane",
		renderTerminalCard("Operator summary", [
			`lane: ${summary.lane || result.workItem?.ownerLane || "ops-automate"}`,
			`workflow state: ${summary.workflowState || result.traceStatus || "awaiting-approval"}`,
			`autonomy: ${summary.autonomyMode || "off"}`,
			`goal: ${result.workItem?.goal || "unknown"}`,
			`approval state: ${summary.approvalState || "pending"}`,
			`support tier: ${summary.supportTier || "unknown"}`,
			`language model: ${summary.generation?.providerId || "none"} / ${summary.generation?.model || "n/a"} / configured ${String(summary.generation?.configured ?? false)}`,
		]),
		renderTerminalCard("References", [
			formatReference("approval", result.approvalRequestId),
			formatReference("trace", result.traceId),
			formatReference("log", result.logFilePath),
			formatReference("artifact", result.artifactId),
			formatReference("artifact path", result.artifactPath),
		]),
		renderTerminalCard("Next action", [
			summary.nextAction ||
				"Resolve the pending approval before ops execution continues.",
		]),
	].join("\n\n");
}

function renderSmoke(result: SmokeRenderResult): string {
	const scenarios = Array.isArray(result.scenarios) ? result.scenarios : [];
	return [
		"OpenGTM smoke harness",
		renderTerminalCard("Operator summary", [
			`harness: ${result.harness || "integrated-runtime-smoke"}`,
			`scenarios: ${result.scenarioCount ?? scenarios.length}`,
			`approval requests: ${result.approvalCount ?? 0}`,
			`connector outcomes: ${formatCountMap(result.connectorStatusSummary).join(", ")}`,
		]),
		section(
			"Scenario status",
			scenarios.map((scenario, index) => {
				const omitted = scenario.omittedPromptSections?.length
					? ` | omitted: ${scenario.omittedPromptSections.join(", ")}`
					: "";
				return renderTerminalCard(`Scenario ${index + 1}`, [
					`name: ${scenario.name || "unknown"}`,
					`lane: ${scenario.lane || "unknown"}`,
					`state: ${scenario.workflowState || "unknown"}`,
					`connector: ${scenario.connectorStatus || "none"}`,
					`approvals: ${scenario.approvalCount ?? 0}`,
					`omitted: ${scenario.omittedPromptSections?.join(", ") || "none"}`,
				]);
			}),
		),
		renderTerminalCard("Next action", [
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
					renderTerminalCard("Approval resolution", [
						`action: ${result.action}`,
						`approval: ${result.approval.id || "unknown"} / ${result.summary?.approvalState || result.approval.status || "unknown"}`,
						`work item: ${result.workItem?.id || "unknown"} / ${result.summary?.workItemState || result.workItem?.status || "unknown"}`,
						`trace: ${result.trace?.id || "unknown"} / ${result.summary?.workflowState || result.trace?.status || "unknown"}`,
						`summary: ${result.approval.actionSummary || result.approval.target || "n/a"}`,
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
		renderTerminalCard("Operator summary", [
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
				: approvals.map((approval, index) =>
						renderTerminalCard(`Approval ${index + 1}`, [
							`id: ${approval.id || "unknown"}`,
							`lane: ${approval.lane || "unknown"}`,
							`status: ${approval.status || "unknown"}`,
							`target: ${approval.target || approval.actionSummary || "unknown"}`,
							approval.status === "pending"
								? `shortcut: /approve ${approval.id || "<id>"} or /deny ${approval.id || "<id>"}`
								: "shortcut: resolved",
						]),
					),
		),
		renderTerminalCard("Next action", [
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
			renderTerminalCard("Trace", [
				`id: ${result.trace.id || "unknown"}`,
				`lane: ${result.trace.lane || "unknown"}`,
				`status: ${result.trace.status || "unknown"}`,
				`workflow: ${result.trace.workflowId || "none"}`,
				`persona: ${result.trace.persona || "none"}`,
				`fixture set: ${result.trace.fixtureSetId || "none"}`,
				`shortcut: opengtm traces show ${result.trace.id || "<trace-id>"}`,
			]),
			renderTerminalCard("References", [
				formatReference("log", result.trace.logFilePath),
				formatReference("debug bundle", result.trace.debugBundlePath),
				formatReference("work item", result.workItem?.id),
			]),
			section(
				"Feedback",
				feedback.length === 0
					? ["none"]
					: feedback.map((item, index) =>
							renderTerminalCard(`Feedback ${index + 1}`, [
								`id: ${item.id || "unknown"}`,
								`action: ${item.action || "unknown"} by ${item.actor || "unknown"}`,
								`message: ${item.message || "no message"}`,
							]),
						),
			),
			renderTerminalCard("Next action", [
				result.summary?.nextAction ||
					"Replay this trace or continue the linked workflow.",
			]),
		].join("\n\n");
	}

	const traces = Array.isArray(result.traces) ? result.traces : [];
	return [
		"Run traces",
		renderTerminalCard("Trace summary", [
			`total: ${result.summary?.total ?? traces.length}`,
			`awaiting approval: ${result.summary?.awaitingApproval ?? 0}`,
			`completed: ${result.summary?.completed ?? 0}`,
			`failed: ${result.summary?.failed ?? 0}`,
		]),
		section(
			"Recent traces",
			traces.length === 0
				? ["none"]
				: traces.map((trace, index) =>
						renderTerminalCard(`Trace ${index + 1}`, [
							`id: ${trace.id || "unknown"}`,
							`lane: ${trace.lane || "unknown"}`,
							`status: ${trace.status || "unknown"}`,
							`log: ${trace.logFilePath || "none"}`,
							`shortcut: opengtm traces show ${trace.id || "<trace-id>"}`,
						]),
					),
		),
	].join("\n\n");
}

function renderWorkflow(result: WorkflowRenderResult): string {
	if (Array.isArray(result.workflows)) {
		return [
			"Workflow catalog",
			renderTerminalCard("Workflow summary", [
				`total: ${result.summary?.total ?? result.workflows.length}`,
				`lanes: ${formatCountMap(result.summary?.byLane).join(", ")}`,
				`support tiers: ${formatCountMap(result.summary?.bySupportTier).join(", ")}`,
				`canonical scenario: ${result.summary?.canonicalScenarioId || "none"}${result.summary?.canonicalScenarioLabel ? ` — ${result.summary.canonicalScenarioLabel}` : ""}`,
			]),
			section(
				"Workflows",
				result.workflows.map((workflow, index) =>
					renderTerminalCard(`Workflow ${index + 1}`, [
						`id: ${workflow.id || "unknown"}`,
						`name: ${workflow.name || "unknown"}`,
						`lane: ${workflow.lane || "unknown"}`,
						`persona: ${workflow.persona || "unknown"}`,
						`approval: ${workflow.requiresApproval ? "required" : "not-required"}`,
						`tier: ${workflow.supportTier || "unknown"}${workflow.isCanonical ? " / canonical" : ""}`,
						`shortcut: opengtm workflow run ${workflow.id || "<workflow-id>"} "<goal>"`,
					]),
				),
			),
		].join("\n\n");
	}

	return [
		"Workflow run",
		renderTerminalCard("Workflow summary", [
			`workflow: ${result.workflow?.id || "unknown"} / ${result.workflow?.name || "unknown"}`,
			`lane: ${result.workflow?.lane || "unknown"}`,
			`persona: ${result.workflow?.persona || "unknown"}`,
			`fixture set: ${result.workflow?.fixtureSetId || "unknown"}`,
			`support tier: ${result.supportTier || result.workflow?.supportTier || "unknown"}${result.isCanonical || result.workflow?.isCanonical ? " / canonical" : ""}`,
			`canonical scenario: ${result.canonicalScenarioId || "none"}`,
			`workflow run: ${result.workflowRun?.id || "unknown"} / ${result.workflowRun?.status || result.workflowState || "unknown"}`,
			`shortcut: opengtm traces show ${result.traceId || "<trace-id>"}`,
		]),
		renderTerminalCard("References", [
			formatReference("trace", result.traceId),
			formatReference("log", result.logFilePath),
			formatReference("approval", result.approvalRequestId),
			formatReference("artifact", result.artifactId),
			formatReference("artifact path", result.artifactPath),
		]),
		renderTerminalCard("Next action", [
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
		renderTerminalCard("Feedback summary", [
			`total: ${result.summary?.total ?? items.length}`,
			`by action: ${formatCountMap(result.summary?.byAction).join(", ")}`,
			formatReference("trace", result.trace?.id),
		]),
		section(
			"Entries",
			items.length === 0
				? ["none"]
				: items.map((item, index) =>
						renderTerminalCard(`Feedback ${index + 1}`, [
							`id: ${item.id || "unknown"}`,
							`action: ${item.action || "unknown"}`,
							`actor: ${item.actor || "unknown"}`,
							`trace: ${item.traceId || "unknown"}`,
							`message: ${item.message || "no message"}`,
							`shortcut: opengtm traces show ${item.traceId || "<trace-id>"}`,
						]),
					),
		),
		renderTerminalCard("Next action", [
			result.summary?.nextAction || "Review the feedback linked to the workflow traces.",
		]),
	].join("\n\n");
}

function renderEvals(result: EvalRenderResult): string {
	const scenarios = Array.isArray(result.scenarios) ? result.scenarios : [];
	const results = Array.isArray(result.results) ? result.results : [];

	return [
		"Evaluation suite",
		renderTerminalCard("Operator summary", [
			`suite: ${result.suite || "unknown"}`,
			`pass: ${typeof result.pass === "boolean" ? String(result.pass) : "n/a"}`,
			`canonical scenario: ${result.canonicalScenarioId || "n/a"}`,
			`baseline score: ${result.baselineScore ?? "n/a"}`,
			`scenario count: ${result.scenarioCount ?? scenarios.length}`,
			`result count: ${results.length}`,
		]),
		...(result.dimensions
			? [
					renderTerminalCard(
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
					renderTerminalCard(
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
						scenarios.map((scenario, index) =>
							renderTerminalCard(`Scenario ${index + 1}`, [
								`name: ${scenario.name || "unknown"}`,
								`status: ${scenario.status || "unknown"}`,
								`connector: ${scenario.connectorStatus || "none"}`,
								`approvals: ${scenario.approvalCount ?? 0}`,
							]),
						),
					),
				]
			: []),
		...(results.length > 0
			? [
					section(
						"Ablations",
						results.map((item, index) =>
							renderTerminalCard(`Ablation ${index + 1}`, [
								`toggle set: ${JSON.stringify(item.toggleSet || {})}`,
								`delta: ${item.deltaTotalScore ?? 0}`,
								`status: ${item.status || "unknown"}`,
								`approvals: ${item.approvalsRequested ?? 0}`,
								`errors: ${item.errorCount ?? 0}`,
							]),
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
		renderTerminalCard("Artifact summary", [
			`total: ${result.summary?.total ?? artifacts.length}`,
			`lanes: ${formatCountMap(result.summary?.byLane).join(", ")}`,
		]),
		section(
			"Artifact refs",
			artifacts.length === 0
				? ["none"]
				: artifacts.map((artifact, index) =>
						renderTerminalCard(`Artifact ${index + 1}`, [
							`id: ${artifact.id || "unknown"}`,
							`lane: ${artifact.lane || "unknown"}`,
							`title: ${artifact.title || artifact.kind || "artifact"}`,
							`trace: ${artifact.traceRef || "no trace"}`,
							"shortcut: /artifacts or opengtm artifacts",
						]),
					),
		),
	].join("\n\n");
}

function renderMemory(result: MemoryRenderResult): string {
	const memory = Array.isArray(result.memory) ? result.memory : [];
	return [
		"Memory records",
		renderTerminalCard("Memory summary", [
			`total: ${result.summary?.total ?? memory.length}`,
			`working: ${result.summary?.working ?? 0}`,
			`episodic: ${result.summary?.episodic ?? 0}`,
			`semantic: ${result.summary?.semantic ?? 0}`,
		]),
		section(
			"Memory refs",
			memory.length === 0
				? ["none"]
				: memory.map((record, index) =>
						renderTerminalCard(`Memory ${index + 1}`, [
							`id: ${record.id || "unknown"}`,
							`type: ${record.memoryType || "unknown"}`,
							`scope: ${record.scope || "unknown"}`,
							`content: ${record.contentRef || "none"}`,
							"shortcut: /memory or opengtm memory",
						]),
					),
		),
	].join("\n\n");
}

function renderConnectors(result: ConnectorRenderResult): string {
	const connectors = Array.isArray(result.connectors) ? result.connectors : [];
	return [
		"Connector inventory",
		renderTerminalCard("Connector summary", [
			`total: ${result.summary?.total ?? connectors.length}`,
			`families: ${bulletList(result.summary?.families ?? [])}`,
			"shortcut: opengtm connector list",
		]),
		section(
			"Connectors",
			connectors.length === 0
				? ["none"]
				: connectors.map((connector, index) =>
						renderTerminalCard(`Connector ${index + 1}`, [
							`provider: ${connector.provider || "unknown"}`,
							`family: ${connector.family || "unknown"}`,
							"shortcut: opengtm connector list",
						]),
					),
		),
	].join("\n\n");
}

function renderDaemonStatus(result: DaemonRenderResult): string {
	return [
		"Daemon status",
		renderTerminalCard("Daemon", [
			`status: ${result.status || "unknown"}`,
			`workspace: ${result.workspace || "none"}`,
			`initiative: ${result.initiative || "none"}`,
			"shortcut: opengtm daemon status",
		]),
		renderTerminalCard("Lane summary", formatCountMap(result.laneSummary)),
		renderTerminalCard("Trace states", formatCountMap(result.traceStatusSummary)),
		renderTerminalCard("Approval states", formatCountMap(result.approvalStatusSummary)),
		renderTerminalCard("Inventory", [
			`work items: ${result.counts?.workItems ?? 0}`,
			`traces: ${result.counts?.traces ?? 0}`,
			`approvals: ${result.counts?.approvals ?? 0}`,
			`feedback: ${result.counts?.feedback ?? 0}`,
			`artifacts: ${result.counts?.artifacts ?? 0}`,
			`memory: ${result.counts?.memory ?? 0}`,
			"shortcut: opengtm traces",
		]),
	].join("\n\n");
}

function renderDashboard(result: DashboardRenderResult): string {
	return [
		result.title || "OpenGTM",
		result.subtitle || "GTM harness CLI",
		renderTerminalCard("Current workspace", [
			`workspace: ${result.current?.workspace || "not initialized"}`,
			`initiative: ${result.current?.initiative || "n/a"}`,
			`provider: ${result.current?.provider || "mock"}`,
			`model: ${result.current?.model || "mock-0"}`,
			`sandbox profile: ${result.current?.sandboxProfile || "read-only"}`,
			"shortcut: opengtm status",
		]),
		...(result.commandGroups || []).map((group) =>
			renderTerminalCard(group.title || "Commands", group.commands || ["none"]),
		),
		renderTerminalCard("Support surface", [
			`live workflows: ${result.support?.liveWorkflows ?? 0}`,
			`reference workflows: ${result.support?.referenceWorkflows ?? 0}`,
			`providers: ${result.support?.providers ?? 0}`,
			`sandbox profiles: ${result.support?.sandboxProfiles ?? 0}`,
			"shortcut: opengtm workflow list",
		]),
		renderTerminalCard("Truthfulness", result.truthfulness || ["none"]),
		renderTerminalCard("Next action", [result.nextAction || "Run `opengtm init` to begin."]),
	].join("\n\n");
}

function renderStatus(result: StatusRenderResult): string {
	return [
		"OpenGTM status",
		renderTerminalCard("Workspace", [
			`workspace: ${result.workspace?.name || "not initialized"}`,
			`workspace id: ${result.workspace?.id || "n/a"}`,
			`initiative: ${result.workspace?.initiativeTitle || "n/a"}`,
			`runtime dir: ${result.workspace?.runtimeDir || ".opengtm/runtime"}`,
			"shortcut: opengtm session runtime",
		]),
		renderTerminalCard("Control plane", [
			`provider: ${result.controlPlane?.provider?.label || result.controlPlane?.provider?.id || "mock"} (${result.controlPlane?.provider?.configured ? "configured" : "unconfigured"})`,
			`auth mode: ${result.controlPlane?.provider?.authMode || "none"}`,
			`auth ref: ${result.controlPlane?.provider?.maskedValue || "n/a"}`,
			`model: ${result.controlPlane?.model || "mock-0"}`,
			`sandbox: ${result.controlPlane?.sandbox?.runtime || "unsupported"} / available ${String(result.controlPlane?.sandbox?.available ?? false)} / profile ${result.controlPlane?.sandbox?.profile || "read-only"}`,
			"shortcut: opengtm auth status",
		]),
		renderTerminalCard("Support surface", [
			`live workflows: ${result.support?.liveWorkflows ?? 0}`,
			`reference-only workflows: ${result.support?.referenceOnlyWorkflows ?? 0}`,
			`built-in skills: ${result.support?.builtInSkills ?? 0}`,
			`built-in agents: ${result.support?.builtInAgents ?? 0}`,
			"shortcut: opengtm workflow list",
		]),
		renderTerminalCard("Inventory", [
			`traces: ${result.inventory?.traces ?? 0}`,
			`approvals: ${result.inventory?.approvals ?? 0}`,
			`feedback: ${result.inventory?.feedback ?? 0}`,
			`artifacts: ${result.inventory?.artifacts ?? 0}`,
			`memory: ${result.inventory?.memory ?? 0}`,
			"shortcut: opengtm traces",
		]),
		renderTerminalCard("Next action", [result.nextAction || "Review workflows and run a GTM task."]),
	].join("\n\n");
}

function renderAuth(result: AuthRenderResult): string {
	const loginShortcut = result.provider?.authMode === 'oauth'
		? `opengtm auth login ${result.provider?.id || "<provider-id>"}`
		: `opengtm auth login ${result.provider?.id || "<provider-id>"} --api-key-env <ENV_VAR>`;
	return [
		"Authentication",
		renderTerminalCard("Provider", [
			`provider: ${result.provider?.label || result.provider?.id || "unknown"}`,
			`mode: ${result.provider?.authMode || "none"}`,
			`configured: ${String(result.configured ?? false)}`,
			`backend: ${result.backend || "n/a"}`,
			`credential ref: ${result.maskedValue || result.envVar || "none"}`,
			`account: ${result.accountId || "none"}`,
			`shortcut: ${loginShortcut}`,
		]),
		...(result.authUrl || result.redirectUri
			? [renderTerminalCard("OAuth flow", [
				`auth url: ${result.authUrl || "none"}`,
				`redirect: ${result.redirectUri || "none"}`,
			])]
			: []),
		renderTerminalCard("Next action", [result.nextAction || "Configure provider auth to continue."]),
	].join("\n\n");
}

function renderTools(result: ToolsRenderResult): string {
	if (result.action === 'show' && result.primitive) {
		return [
			'Harness primitive',
			renderTerminalCard('Primitive', [
				`name: ${result.primitive.name || 'unknown'}`,
				`category: ${result.primitive.category || 'unknown'}`,
				`available: ${String(Boolean(result.primitive.available))}`,
				`description: ${result.primitive.description || 'none'}`,
				`rationale: ${result.primitive.rationale || 'none'}`
			]),
			renderTerminalCard('Next action', [result.nextAction || 'Inspect another primitive.'])
		].join('\n\n')
	}

	if (result.action === 'run') {
		return [
			'Harness primitive execution',
			renderTerminalCard('Primitive', [
				`name: ${result.primitive?.name || 'unknown'}`,
				`category: ${result.primitive?.category || 'unknown'}`,
				`available: ${String(Boolean(result.primitive?.available))}`
			]),
			renderTerminalCard('Result', [JSON.stringify(result.result, null, 2)]),
			renderTerminalCard('Next action', [result.nextAction || 'Inspect another primitive.'])
		].join('\n\n')
	}

	const primitives = Array.isArray(result.primitives) ? result.primitives : []
	return [
		'Harness primitives',
		renderTerminalCard('Summary', [
			`total: ${result.summary?.total ?? primitives.length}`,
			`available: ${result.summary?.available ?? primitives.filter((primitive) => primitive.available).length}`,
			`unavailable: ${result.summary?.unavailable ?? primitives.filter((primitive) => !primitive.available).length}`,
			'shortcut: opengtm tool show <primitive>'
		]),
		section(
			'Primitive list',
			primitives.length === 0
				? ['none']
				: primitives.map((primitive) => renderTerminalCard(primitive.name || 'unknown', [
					`category: ${primitive.category || 'unknown'}`,
					`available: ${String(Boolean(primitive.available))}`,
					`description: ${primitive.description || 'none'}`
				]))
		),
		renderTerminalCard('Next action', [result.nextAction || 'Inspect a primitive in detail.'])
	].join('\n\n')
}

function renderCode(result: CodeRenderResult): string {
	return [
		'Coding harness',
		renderTerminalCard('Goal', [result.goal || 'none']),
		renderTerminalCard('Primitive loop output', [(result.output || 'none').slice(0, 6000)]),
		renderTerminalCard('Next action', [result.nextAction || 'Continue with another coding request.'])
	].join('\n\n')
}

function renderProviders(result: ProvidersRenderResult): string {
	const providers = Array.isArray(result.providers) ? result.providers : [];
	return [
		"Providers",
		renderTerminalCard("Provider summary", [
			`current provider: ${result.currentProvider || "mock"}`,
			`available profiles: ${providers.length}`,
			"shortcut: opengtm provider list",
		]),
		section(
			"Profiles",
			providers.length === 0
				? ["none"]
				: providers.map((provider, index) =>
						renderTerminalCard(`Provider ${index + 1}`, [
							`id: ${provider.id || "unknown"}`,
							`label: ${provider.label || "unknown"}`,
							`tier: ${provider.supportTier || "unknown"}`,
							`auth: ${provider.authMode || "unknown"}`,
							`configured: ${String(provider.configured ?? false)}`,
							`description: ${provider.description || "no description"}`,
							`shortcut: opengtm provider use ${provider.id || "<provider-id>"}`,
						]),
					),
		),
		renderTerminalCard("Next action", [result.nextAction || "Switch providers as needed."]),
	].join("\n\n");
}

function renderModels(result: ModelsRenderResult): string {
	const models = Array.isArray(result.models) ? result.models : [];
	return [
		"Models",
		renderTerminalCard("Model summary", [
			`provider: ${result.provider?.label || result.provider?.id || "unknown"}`,
			`current model: ${result.currentModel || "unknown"}`,
			"shortcut: opengtm models list",
		]),
		section(
			"Available models",
			models.length === 0
				? ["none"]
				: models.map((model, index) =>
						renderTerminalCard(`Model ${index + 1}`, [
							`id: ${model.id || "unknown"}`,
							`current: ${String(Boolean(model.current))}`,
							`shortcut: opengtm models use ${model.id || "<model-id>"}`,
						]),
					),
		),
		renderTerminalCard("Next action", [result.nextAction || "Switch models as needed."]),
	].join("\n\n");
}

function renderSandbox(result: SandboxRenderResult): string {
	const profileList = Array.isArray(result.profiles) ? result.profiles : [];
	const command = result.command?.join(" ") || "n/a";
	return [
		"Sandbox",
		renderTerminalCard("Sandbox summary", [
			`action: ${result.action || "status"}`,
			`runtime: ${result.runtime || "unsupported"}`,
			`available: ${String(result.available ?? false)}`,
			`current profile: ${result.currentProfile || "read-only"}`,
			`status: ${result.status || "n/a"}`,
			`command: ${command}`,
			"shortcut: opengtm sandbox status",
		]),
		...(result.profile
			? [
					renderTerminalCard("Profile", [
						`id: ${result.profile.id || "unknown"}`,
						`label: ${result.profile.label || "unknown"}`,
						`description: ${result.profile.description || "unknown"}`,
						`restrictions: ${bulletList(result.profile.restrictions || [])}`,
						`policy: ${result.profile.policy || ""}`,
						`shortcut: opengtm sandbox explain --profile ${result.profile.id || "<profile-id>"}`,
					]),
				]
			: []),
		...(profileList.length > 0
			? [
					section(
						"Profiles",
						profileList.map((profile, index) =>
							renderTerminalCard(`Profile ${index + 1}`, [
								`id: ${profile.id || "unknown"}`,
								`label: ${profile.label || "unknown"}`,
								`description: ${profile.description || "unknown"}`,
								`restrictions: ${profile.restrictions?.join(", ") || "none"}`,
								`shortcut: opengtm sandbox explain --profile ${profile.id || "<profile-id>"}`,
							]),
						),
					),
				]
			: []),
		...(result.stdout ? [section("stdout", [result.stdout])] : []),
		...(result.stderr ? [section("stderr", [result.stderr])] : []),
		...(result.error ? [section("error", [result.error])] : []),
		...(result.artifactId || result.artifactPath
			? [
					renderTerminalCard("Artifact", [
						formatReference("artifact", result.artifactId),
						formatReference("artifact path", result.artifactPath),
					]),
				]
			: []),
		renderTerminalCard("Next action", [result.nextAction || "Review sandbox posture before running live automations."]),
	].join("\n\n");
}

function renderSkills(result: SkillsRenderResult): string {
	if (result.skill) {
		return [
			"Skill detail",
			renderTerminalCard("Skill", [
				`id: ${String(result.skill.id || "unknown")}`,
				`name: ${String(result.skill.name || "unknown")}`,
				`persona: ${String(result.skill.persona || "unknown")}`,
				`source: ${String(result.skill.source || "unknown")}`,
				`path: ${String(result.skill.path || "n/a")}`,
				`shortcut: opengtm skill show ${String(result.skill.id || "<skill-id>")}`,
			]),
			renderTerminalCard("Summary", [String(result.skill.summary || "n/a")]),
			renderTerminalCard("Next action", [result.nextAction || "Review the skill before using it."]),
		].join("\n\n");
	}

	const skills = Array.isArray(result.skills) ? result.skills : [];
	return [
		"Skills",
		renderTerminalCard("Skill summary", [`total: ${skills.length}`]),
		section(
			"Skill catalog",
			skills.length === 0
				? ["none"]
				: skills.map((skill, index) =>
						renderTerminalCard(`Skill ${index + 1}`, [
							`id: ${skill.id || "unknown"}`,
							`name: ${skill.name || "unknown"}`,
							`persona: ${skill.persona || "unknown"}`,
							`source: ${skill.source || "unknown"}`,
							`summary: ${skill.summary || "n/a"}`,
							`shortcut: opengtm skill show ${skill.id || "<skill-id>"}`,
						]),
					),
		),
		renderTerminalCard("Next action", [result.nextAction || "Review or scaffold skills as needed."]),
	].join("\n\n");
}

function renderAgents(result: AgentsRenderResult): string {
	if (result.harness) {
		const jobs = Array.isArray(result.jobs) ? result.jobs : [];
		return [
			"GTM agentic harness",
			renderTerminalCard("Harness", [
				`id: ${result.harness.id || "unknown"}`,
				`motion: ${result.harness.motion || "unknown"}`,
				`target: ${result.harness.targetEntity || "unknown"}`,
				`status: ${result.harness.status || "unknown"}`,
				`stages: ${result.harness.stageCount ?? jobs.length}`,
				`approval: ${result.harness.approvalRequestId || "none"}`,
				`trace: ${result.harness.traceId || "none"}`,
				`artifact: ${result.harness.artifactId || "none"}`,
				`artifact path: ${result.harness.artifactPath || "none"}`,
			]),
			renderTerminalCard("Summary", [result.harness.summary || "n/a"]),
			renderTerminalCard("Principles", result.harness.principles || []),
			section(
				"Delegation ledger",
				jobs.length === 0
					? ["none"]
					: jobs.map((job, index) =>
							renderTerminalCard(`Job ${index + 1}`, [
								`id: ${job.id || "unknown"}`,
								`agent: ${job.agentType || "unknown"}`,
								`lane: ${job.lane || "unknown"}`,
								`status: ${job.status || "unknown"}`,
								`parent: ${job.parentJobId || "none"}`,
								`depends on: ${(job.dependsOnJobIds || []).join(", ") || "none"}`,
								`goal: ${job.goal || "n/a"}`,
								`summary: ${job.summary || "n/a"}`,
							]),
						),
			),
			renderTerminalCard("Next action", [result.nextAction || "Review the harness trace and approval state."]),
		].join("\n\n");
	}

	if (result.job) {
		const job = result.job;
		return [
			"Agent job",
			renderTerminalCard("Job", [
				`id: ${job.id || "unknown"}`,
				`agent: ${job.agentType || "unknown"}`,
				`lane: ${job.lane || "unknown"}`,
				`status: ${job.status || "unknown"}`,
				`progress: ${job.progress ?? "n/a"}`,
				`approval: ${job.approvalRequestId || "n/a"}`,
				`sources: ${(job.sourceIds || []).join(", ") || "none"}`,
				`artifacts: ${(job.artifactIds || []).join(", ") || "none"}`,
				`updated: ${job.updatedAt || "unknown"}`,
			]),
			renderTerminalCard("Goal", [job.goal || "n/a"]),
			renderTerminalCard("Summary", [job.summary || "n/a"]),
			renderTerminalCard("Next action", [result.nextAction || "Keep the durable job ledger current."]),
		].join("\n\n");
	}

	if (Array.isArray(result.jobs)) {
		const jobs = result.jobs;
		return [
			"Agent jobs",
			renderTerminalCard("Job summary", [
				`total: ${result.summary?.total ?? jobs.length}`,
				`queued: ${result.summary?.queued ?? 0}`,
				`running: ${result.summary?.running ?? 0}`,
				`awaiting approval: ${result.summary?.awaitingApproval ?? 0}`,
				`completed: ${result.summary?.completed ?? 0}`,
			]),
			section(
				"Job ledger",
				jobs.length === 0
					? ["none"]
					: jobs.map((job, index) =>
							renderTerminalCard(`Job ${index + 1}`, [
								`id: ${job.id || "unknown"}`,
								`agent: ${job.agentType || "unknown"}`,
								`lane: ${job.lane || "unknown"}`,
								`status: ${job.status || "unknown"}`,
								`goal: ${job.goal || "n/a"}`,
								`summary: ${job.summary || "n/a"}`,
								`sources: ${(job.sourceIds || []).join(", ") || "none"}`,
								`shortcut: opengtm agent job update ${job.id || "<job-id>"} --status running`,
							]),
						),
			),
			renderTerminalCard("Next action", [result.nextAction || "Create or update an agent job as work progresses."]),
		].join("\n\n");
	}

	if (result.agent) {
		return [
			"Agent detail",
			renderTerminalCard("Agent", [
				`id: ${result.agent.id || "unknown"}`,
				`name: ${result.agent.name || "unknown"}`,
				`persona: ${result.agent.persona || "unknown"}`,
				`model: ${result.agent.defaultModel || "unknown"}`,
				`source: ${result.agent.source || "unknown"}`,
				`path: ${result.agent.path || "n/a"}`,
				`skills: ${(result.agent.recommendedSkills || []).join(", ") || "none"}`,
				`shortcut: opengtm agent show ${result.agent.id || "<agent-id>"}`,
			]),
			renderTerminalCard("Summary", [result.agent.description || "n/a"]),
			renderTerminalCard("Next action", [result.nextAction || "Review the agent before using it."]),
		].join("\n\n");
	}

	const agents = Array.isArray(result.agents) ? result.agents : [];
	return [
		"Agents",
		renderTerminalCard("Agent summary", [`total: ${agents.length}`]),
		section(
			"Agent catalog",
			agents.length === 0
				? ["none"]
				: agents.map((agent, index) =>
						renderTerminalCard(`Agent ${index + 1}`, [
							`id: ${agent.id || "unknown"}`,
							`name: ${agent.name || "unknown"}`,
							`persona: ${agent.persona || "unknown"}`,
							`source: ${agent.source || "unknown"}`,
							`summary: ${agent.description || "n/a"}`,
							`shortcut: opengtm agent show ${agent.id || "<agent-id>"}`,
						]),
					),
		),
		renderTerminalCard("Next action", [result.nextAction || "Review or scaffold agents as needed."]),
	].join("\n\n");
}

function renderLearn(result: LearnRenderResult): string {
	return [
		"Learning review",
		renderTerminalCard("Operator summary", [
			`workflow focus: ${result.dominantWorkflow || "unknown"}`,
			`generated skill scaffold: ${String(result.generated ?? false)}`,
			`artifact: ${result.artifactId || "none"}`,
			`artifact path: ${result.artifactPath || "none"}`,
			"shortcut: opengtm skill list",
		]),
		renderTerminalCard("Evidence", [
			`denied approvals: ${result.evidence?.deniedApprovals ?? 0}`,
			`revise feedback: ${result.evidence?.reviseFeedback ?? 0}`,
			`deny feedback: ${result.evidence?.deniedFeedback ?? 0}`,
			`candidate skill path: ${result.candidateSkillPath || "none"}`,
		]),
		renderTerminalCard("Next action", [result.nextAction || "Review generated learning artifacts."]),
	].join("\n\n");
}

function renderSessionStatus(result: SessionStatusRenderResult): string {
	const advanceShortcut = renderAdvanceShortcut(result.session?.advance || result.advance || null);
	return [
		"Interactive session status",
		renderTerminalCard("Session", [
			`session: ${result.session?.sessionId || "none"}`,
			`status: ${result.session?.status || "none"}`,
			`transcript: ${result.session?.transcriptPath || "none"}`,
			`created: ${result.session?.createdAt || "n/a"}`,
			`updated: ${result.session?.updatedAt || "n/a"}`,
			`last trace: ${result.session?.lastTraceId || "none"}`,
			`last approval: ${result.session?.lastApprovalRequestId || "none"}`,
			`last artifact: ${result.session?.lastArtifactId || "none"}`,
			`last memory: ${result.session?.lastMemoryId || "none"}`,
			`last workflow: ${result.session?.lastWorkflowId || "none"}`,
			`focus entity: ${result.session?.focusEntity || "none"}`,
			`focus type: ${result.session?.focusType || "none"}`,
			`last intent: ${result.session?.lastIntent || "none"}`,
			`last specialist: ${result.session?.lastSpecialist || "none"}`,
			"shortcut: opengtm session transcript",
		]),
		renderTerminalCard("Advance status", [
			`status: ${result.session?.advance?.status || result.advance?.status || "idle"}`,
			`run id: ${result.session?.advance?.runId || result.advance?.runId || "none"}`,
			`steps: ${result.session?.advance?.stepsExecuted ?? result.advance?.stepsExecuted ?? 0} / ${result.session?.advance?.stepsRequested ?? result.advance?.stepsRequested ?? 0}`,
			`stop reason: ${result.session?.advance?.stopReason || result.advance?.stopReason || "none"}`,
			`last card: ${result.session?.advance?.lastCardTitle || result.advance?.lastCardTitle || "none"}`,
			`last command: ${result.session?.advance?.lastCommand || result.advance?.lastCommand || "none"}`,
			`shortcut: ${advanceShortcut}`,
		]),
		renderTerminalCard("Next action", [result.nextAction || "Run `opengtm` to start the harness."]),
	].join("\n\n");
}

function renderSessionRuntime(result: SessionRuntimeRenderResult): string {
	const advanceShortcut = renderAdvanceShortcut(result.session?.advance || null);
	const lineageSections = result.session?.lineage || null;
	const activeLineage = [
		lineageSections?.lead
			? `lead — ${lineageSections.lead.entity || "unknown"} / checkpoint ${lineageSections.lead.checkpointId || "none"} / sources ${lineageSections.lead.sourceArtifacts ?? 0}`
			: null,
		lineageSections?.account
			? `account — ${lineageSections.account.entity || "unknown"} / checkpoint ${lineageSections.account.checkpointId || "none"} / sources ${lineageSections.account.sourceArtifacts ?? 0}`
			: null,
		lineageSections?.deal
			? `deal — ${lineageSections.deal.entity || "unknown"} / checkpoint ${lineageSections.deal.checkpointId || "none"} / sources ${lineageSections.deal.sourceArtifacts ?? 0}`
			: null,
	].filter(Boolean) as string[];
	const actionCards = Array.isArray(result.actionCards) ? result.actionCards : [];

	return [
		"Interactive runtime",
		renderTerminalCard("Session focus", [
			`session: ${result.session?.sessionId || "none"}`,
			`status: ${result.session?.status || "none"}`,
			`focus: ${result.session?.focusType || "none"} / ${result.session?.focusEntity || "none"}`,
			`last intent: ${result.session?.lastIntent || "none"}`,
			`last specialist: ${result.session?.lastSpecialist || "none"}`,
			`last workflow: ${result.session?.lastWorkflowId || "none"}`,
			`last trace: ${result.session?.lastTraceId || "none"}`,
		]),
		renderTerminalCard("Governance", [
			`provider: ${result.controlPlane?.provider?.label || result.controlPlane?.provider?.id || "mock"} (${result.controlPlane?.provider?.configured ? "configured" : "unconfigured"})`,
			`model: ${result.controlPlane?.provider?.model || "mock-0"}`,
			`sandbox: ${result.controlPlane?.sandbox?.runtime || "unsupported"} / available ${String(result.controlPlane?.sandbox?.available ?? false)} / profile ${result.controlPlane?.sandbox?.profile || "read-only"}`,
		]),
		renderTerminalCard("Inventory", [
			`pending approvals: ${result.inventory?.pendingApprovals ?? 0}`,
			`total approvals: ${result.inventory?.totalApprovals ?? 0}`,
			`traces: ${result.inventory?.traces ?? 0}`,
			`latest trace: ${result.inventory?.latestTrace?.workflowId || "none"} / ${result.inventory?.latestTrace?.status || "none"}`,
		]),
		renderTerminalCard("Advance status", [
			`status: ${result.session?.advance?.status || "idle"}`,
			`run id: ${result.session?.advance?.runId || "none"}`,
			`steps: ${result.session?.advance?.stepsExecuted ?? 0} / ${result.session?.advance?.stepsRequested ?? 0}`,
			`stop reason: ${result.session?.advance?.stopReason || "none"}`,
			`last card: ${result.session?.advance?.lastCardTitle || "none"}`,
			`last command: ${result.session?.advance?.lastCommand || "none"}`,
			`shortcut: ${advanceShortcut}`,
		]),
		...(result.leadRuntime
			? [
					renderTerminalCard("Lead motion", [
						`phase: ${result.leadRuntime.phase || "n/a"}`,
						`relationship: ${result.leadRuntime.relationshipState || "n/a"}`,
						`do-not-send: ${result.leadRuntime.doNotSend || "n/a"}`,
						`approach: ${result.leadRuntime.recommendedApproach || "n/a"}`,
					]),
				]
			: []),
		...(result.accountRuntime
			? [renderTerminalCard("Account motion", [`phase: ${result.accountRuntime.phase || "n/a"}`])]
			: []),
		...(result.dealRuntime
			? [renderTerminalCard("Deal motion", [`phase: ${result.dealRuntime.phase || "n/a"}`])]
			: []),
		renderTerminalCard("Recommended actions", result.recommendedActions?.length ? result.recommendedActions : ["none"]),
		renderTerminalCard("Action cards", actionCards.length > 0 ? renderActionCardSlots(actionCards) : ["none"]),
		renderTerminalCard("Runtime lineage", activeLineage.length > 0 ? activeLineage : ["none"]),
		renderTerminalCard("Next action", [result.nextAction || "Continue the GTM runtime."]),
	].join("\n\n");
}

function renderSessionLaunch(result: SessionLaunchRenderResult): string {
	return [
		"Interactive session launch",
		renderTerminalCard("Operator summary", [
			`requires tty: ${String(result.requiresTty ?? true)}`,
			`cwd: ${result.cwd || process.cwd()}`,
			"shortcut: opengtm",
		]),
		renderTerminalCard("Next action", [result.nextAction || "Run `opengtm` in a terminal to start the harness session."]),
	].join("\n\n");
}

function renderSessionQuery(result: SessionQueryRenderResult): string {
	const actionCards = Array.isArray(result.actionCards) ? result.actionCards : [];
	return [
		"Interactive harness query",
		renderTerminalCard("Operator summary", [
			`query: ${result.queryType || "unknown"}`,
			`specialist: ${result.specialist || "supervisor"}`,
			`entity: ${result.entity || "n/a"}`,
		]),
		renderTerminalCard("Summary", result.summary || ["none"]),
		...(result.recommendedActions?.length
			? [renderTerminalCard("Recommended actions", result.recommendedActions)]
			: []),
		...(actionCards.length
			? [renderTerminalCard("Action cards", renderActionCardSlots(actionCards))]
			: []),
		...(result.approvals?.length
			? [
					renderTerminalCard(
						"Approvals",
						result.approvals.map((item, index) =>
							renderTerminalCard(`Approval ${index + 1}`, [
								`id: ${item.id || "unknown"}`,
								`status: ${item.status || "unknown"}`,
								`summary: ${item.actionSummary || "n/a"}`,
							]),
						),
					),
				]
			: []),
		...(result.traces?.length
			? [
					renderTerminalCard(
						"Traces",
						result.traces.map((item, index) =>
							renderTerminalCard(`Trace ${index + 1}`, [
								`id: ${item.id || "unknown"}`,
								`workflow: ${item.workflowId || "lane-only"}`,
								`status: ${item.status || "unknown"}`,
								`shortcut: opengtm traces show ${item.id || "<trace-id>"}`,
							]),
						),
					),
				]
			: []),
		...(result.artifacts?.length
			? [
					renderTerminalCard(
						"Artifacts",
						result.artifacts.map((item, index) =>
							renderTerminalCard(`Artifact ${index + 1}`, [
								`id: ${item.id || "unknown"}`,
								`title: ${item.title || "artifact"}`,
								`path: ${item.path || "none"}`,
								"shortcut: /artifacts or opengtm artifacts",
							]),
						),
					),
				]
			: []),
		...(result.memory?.length
			? [
					renderTerminalCard(
						"Memory",
						result.memory.map((item, index) =>
							renderTerminalCard(`Memory ${index + 1}`, [
								`id: ${item.id || "unknown"}`,
								`type: ${item.memoryType || "unknown"}`,
								`path: ${item.path || "none"}`,
								"shortcut: /memory or opengtm memory",
							]),
						),
					),
				]
			: []),
		renderTerminalCard("Next action", [result.nextAction || "Continue with another GTM task."]),
	].join("\n\n");
}

function renderActionCardSlots(cards: Array<{ title?: string; reason?: string; commandArgs?: string[] }>) {
	return cards.map((card, index) => {
		const command = Array.isArray(card.commandArgs) && card.commandArgs.length > 0
			? `opengtm ${card.commandArgs.join(" ")}`
			: "n/a";
		const approvalShortcut =
			card.commandArgs?.[0] === "approvals"
				? ` /${card.commandArgs?.[1] || "approve"} ${card.commandArgs?.[2] || ""}`.trimEnd()
				: null;
		return renderTerminalCard(`Action card ${index + 1}`, [
			`title: ${card.title || "untitled"}`,
			`reason: ${card.reason || "no reason"}`,
			`command: ${command}`,
			`shortcut: /do ${index + 1}${approvalShortcut ? ` or ${approvalShortcut}` : ""}`,
		]);
	});
}

function renderTerminalCard(title: string, lines: string[]) {
	return [
		`╭─ ${sanitizeTerminalRenderableText(title)}`,
		...lines.flatMap((line) =>
			sanitizeTerminalRenderableText(String(line))
				.split("\n")
				.map((part) => `│ ${part}`),
		),
		"╰─",
	].join("\n");
}

function sanitizeTerminalRenderableText(value: string) {
	return value
		.replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
		.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
}

function renderAdvanceShortcut(advance: SessionAdvanceRenderState | null | undefined) {
	if (advance?.status === "waiting-for-approval" || advance?.status === "stopped") {
		return "opengtm session resume";
	}
	return "opengtm session advance 3";
}

function renderSessionTranscript(result: SessionTranscriptRenderResult): string {
	const entries = Array.isArray(result.entries) ? result.entries : [];
	return [
		"Interactive session transcript",
		renderTerminalCard("Session", [
			`session: ${result.session?.sessionId || "none"}`,
			`status: ${result.session?.status || "none"}`,
			`transcript: ${result.session?.transcriptPath || "none"}`,
			"shortcut: opengtm session transcript",
		]),
		...(result.error ? [renderTerminalCard("Transcript status", [`error: ${result.error}`])] : []),
		section(
			"Recent messages",
			entries.length === 0
				? ["none"]
				: entries.map((entry, index) =>
						renderTerminalCard(`Message ${index + 1}`, [
							`created: ${entry.createdAt || "unknown"}`,
							`role: ${entry.role || "unknown"}`,
							`content: ${entry.content || ""}`,
						]),
					),
		),
		renderTerminalCard("Next action", [result.nextAction || "Run `opengtm` to continue the session."]),
	].join("\n\n");
}

function renderSessionCompact(result: SessionCompactRenderResult): string {
	return [
		"Interactive session compact",
		renderTerminalCard("Session", [
			`session: ${result.session?.sessionId || "none"}`,
			`status: ${result.session?.status || "none"}`,
			`transcript: ${result.session?.transcriptPath || "none"}`,
			`backup: ${result.backupPath || "none"}`,
			`entries: ${result.previousEntryCount ?? 0} -> ${result.compactedEntryCount ?? 0}`,
			"shortcut: opengtm session compact",
		]),
		...(result.error ? [renderTerminalCard("Compaction status", [`error: ${result.error}`])] : []),
		renderTerminalCard("Summary preview", [result.summaryPreview || "none"]),
		renderTerminalCard("Next action", [result.nextAction || "Run `opengtm` to continue the session."]),
	].join("\n\n");
}

function renderSessionAction(result: SessionActionRenderResult): string {
	return [
		result.output || "No session action output available.",
		renderTerminalCard("Next action", [result.nextAction || "Continue the runtime loop."]),
	].join("\n\n");
}

function renderSessionCards(result: SessionCardsRenderResult): string {
	const actionCards = Array.isArray(result.actionCards) ? result.actionCards : [];
	return [
		"Interactive session cards",
		renderTerminalCard("Session", [
			`session: ${result.session?.sessionId || "none"}`,
			`status: ${result.session?.status || "none"}`,
			`focus: ${result.session?.focusType || "none"} / ${result.session?.focusEntity || "none"}`,
			`cards source: ${result.refreshed ? "refreshed" : "persisted"}`,
			"shortcut: opengtm session do 1",
		]),
		renderTerminalCard("Action cards", actionCards.length > 0 ? renderActionCardSlots(actionCards) : ["none"]),
		renderTerminalCard("Next action", [result.nextAction || "Continue the runtime loop."]),
	].join("\n\n");
}

function renderSessionProgress(result: SessionProgressRenderResult): string {
	const history = Array.isArray(result.history) ? result.history : [];
	return [
		"Interactive session progress",
		renderTerminalCard("Session", [
			`session: ${result.session?.sessionId || "none"}`,
			`status: ${result.session?.status || "none"}`,
			`focus: ${result.session?.focusType || "none"} / ${result.session?.focusEntity || "none"}`,
			"shortcut: opengtm session progress",
		]),
		renderTerminalCard("Current advance", [
			`status: ${result.advance?.status || "idle"}`,
			`run id: ${result.advance?.runId || "none"}`,
			`steps: ${result.advance?.stepsExecuted ?? 0} / ${result.advance?.stepsRequested ?? 0}`,
			`stop reason: ${result.advance?.stopReason || "none"}`,
			`last card: ${result.advance?.lastCardTitle || "none"}`,
			`last command: ${result.advance?.lastCommand || "none"}`,
			`shortcut: ${renderAdvanceShortcut(result.advance)}`,
		]),
		renderTerminalCard(
			"Advance history",
			history.length > 0
				? history.slice(0, 5).map((entry, index) =>
						[
							`[run ${index + 1}] ${entry.mode || "advance"} / ${entry.finalStatus || "unknown"}`,
							`run id: ${entry.runId || "none"}`,
							`steps: ${entry.stepsExecuted ?? 0} / ${entry.stepsRequested ?? 0}`,
							`stop reason: ${entry.stopReason || "none"}`,
							`last card: ${entry.lastCardTitle || "none"}`,
							`last command: ${entry.lastCommand || "none"}`,
						].join("\n"),
					)
				: ["none"],
		),
		renderTerminalCard("Next action", [result.nextAction || "Continue the runtime loop."]),
	].join("\n\n");
}

export function renderHumanOutput(
	parsed: OpenGtmCliParsed,
	result: unknown,
): string {
	const typedResult = (result ?? {}) as { kind?: string };
	if (typedResult.kind === "dashboard") {
		return renderDashboard(typedResult as DashboardRenderResult);
	}
	if (typedResult.kind === "status") {
		return renderStatus(typedResult as StatusRenderResult);
	}
	if (typedResult.kind === "auth") {
		return renderAuth(typedResult as AuthRenderResult);
	}
	if (typedResult.kind === "tools") {
		return renderTools(typedResult as ToolsRenderResult);
	}
	if (typedResult.kind === "code") {
		return renderCode(typedResult as CodeRenderResult);
	}
	if (typedResult.kind === "providers") {
		return renderProviders(typedResult as ProvidersRenderResult);
	}
	if (typedResult.kind === "models") {
		return renderModels(typedResult as ModelsRenderResult);
	}
	if (typedResult.kind === "sandbox") {
		return renderSandbox(typedResult as SandboxRenderResult);
	}
	if (typedResult.kind === "skills") {
		return renderSkills(typedResult as SkillsRenderResult);
	}
	if (typedResult.kind === "agents") {
		return renderAgents(typedResult as AgentsRenderResult);
	}
	if (typedResult.kind === "learn") {
		return renderLearn(typedResult as LearnRenderResult);
	}
	if (typedResult.kind === "session-status") {
		return renderSessionStatus(typedResult as SessionStatusRenderResult);
	}
	if (typedResult.kind === "session-runtime") {
		return renderSessionRuntime(typedResult as SessionRuntimeRenderResult);
	}
	if (typedResult.kind === "session-launch") {
		return renderSessionLaunch(typedResult as SessionLaunchRenderResult);
	}
	if (typedResult.kind === "session-transcript") {
		return renderSessionTranscript(typedResult as SessionTranscriptRenderResult);
	}
	if (typedResult.kind === "session-compact") {
		return renderSessionCompact(typedResult as SessionCompactRenderResult);
	}
	if (typedResult.kind === "session-action") {
		return renderSessionAction(typedResult as SessionActionRenderResult);
	}
	if (typedResult.kind === "session-cards") {
		return renderSessionCards(typedResult as SessionCardsRenderResult);
	}
	if (typedResult.kind === "session-progress") {
		return renderSessionProgress(typedResult as SessionProgressRenderResult);
	}
	if (typedResult.kind === "session-query") {
		return renderSessionQuery(typedResult as SessionQueryRenderResult);
	}

	if (parsed.command === "init") {
		return renderInit((result ?? {}) as InitRenderResult);
	}

	if (parsed.command === "run" && parsed.subcommand === "research") {
		return renderResearch((result ?? {}) as ResearchRenderResult);
	}

	if (parsed.command === "run" && parsed.subcommand === "build") {
		return renderBuild((result ?? {}) as BuildRenderResult);
	}

	if (parsed.command === "run" && parsed.subcommand === "ops") {
		return renderOps((result ?? {}) as OpsRenderResult);
	}

	if (
		(parsed.command === "run" && parsed.subcommand === "opengtm") ||
		parsed.command === "smoke"
	) {
		return renderSmoke((result ?? {}) as SmokeRenderResult);
	}

	if (parsed.command === "approvals") {
		return renderApprovals((result ?? {}) as ApprovalRenderResult);
	}

	if (parsed.command === "traces" && (parsed.subcommand === "" || parsed.subcommand === "list")) {
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

	if (parsed.command === "artifacts" && (parsed.subcommand === "" || parsed.subcommand === "list")) {
		return renderArtifacts((result ?? {}) as ArtifactRenderResult);
	}

	if (parsed.command === "memory" && (parsed.subcommand === "" || parsed.subcommand === "list")) {
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
