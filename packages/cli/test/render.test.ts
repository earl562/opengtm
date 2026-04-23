import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalDaemon } from "@opengtm/daemon";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleApprovals } from "../src/handlers/approvals.js";
import { handleBuildRun } from "../src/handlers/build.js";
import { handleEvals } from "../src/handlers/evals.js";
import { handleResearchRun } from "../src/handlers/research.js";
import { handleWorkflowCatalog, handleWorkflowRun } from "../src/handlers/workflows.js";
import { runOpenGtmCli } from "../src/index.js";
import { parseCliArgs } from "../src/parse.js";
import { renderCliOutput } from "../src/render/index.js";

describe("cli rendering", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("parses flags regardless of position", () => {
		expect(parseCliArgs(["run", "research", "--json", "acme"])).toEqual({
			command: "run",
			subcommand: "research",
			flags: { json: true },
			positional: ["acme"],
			tokens: ["run", "research", "acme"],
			passthrough: [],
		});

		expect(parseCliArgs(["--json", "connector", "list"])).toEqual({
			command: "connector",
			subcommand: "list",
			flags: { json: true },
			positional: [],
			tokens: ["connector", "list"],
			passthrough: [],
		});
	});

	it("renders GTM operator summaries for research and build runs", async () => {
		const rootDir = mkdtempSync(join(tmpdir(), "opengtm-render-"));
		const daemon = createLocalDaemon({ rootDir });

		const research = await handleResearchRun({
			daemon,
			goal: "research acme expansion",
			workspaceId: "w1",
			initiativeId: "i1",
		});

		const researchOutput = renderCliOutput({
			parsed: parseCliArgs(["run", "research", "research acme expansion"]),
			result: research,
		});

		expect(researchOutput).toContain("OpenGTM research lane");
		expect(researchOutput).toContain("workflow state: completed");
		expect(researchOutput).toContain("autonomy: off");
		expect(researchOutput).toContain("artifact path:");
		expect(researchOutput).toContain("Next action");
		expect(researchOutput).toContain("╭─ Next action");

		const build = await handleBuildRun({
			daemon,
			goal: "ship acme flow",
			workspaceId: "w1",
			initiativeId: "i1",
		});

		const buildOutput = renderCliOutput({
			parsed: parseCliArgs(["run", "build", "ship acme flow"]),
			result: build,
		});

		expect(buildOutput).toContain("OpenGTM build lane");
		expect(buildOutput).toContain("autonomy: off");
		expect(buildOutput).toContain("approval state: pending");
		expect(buildOutput).toContain("Resolve the approval request");
		expect(buildOutput).toContain("╭─ Next action");

		rmSync(rootDir, { recursive: true, force: true });
	});

	it("keeps default output human-readable and --json machine-readable", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(await runOpenGtmCli(["connector", "list"])).toBe(0);
		expect(errorSpy).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(logSpy.mock.calls[0]?.[0]).toContain("Connector inventory");
		expect(logSpy.mock.calls[0]?.[0]).not.toContain('"connectors"');

		logSpy.mockClear();

		expect(await runOpenGtmCli(["connector", "list", "--json"])).toBe(0);
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(() => JSON.parse(String(logSpy.mock.calls[0]?.[0]))).not.toThrow();
		expect(String(logSpy.mock.calls[0]?.[0])).toContain('"connectors"');
	});

	it("renders build approval continuation references after approve", async () => {
		const rootDir = mkdtempSync(join(tmpdir(), "opengtm-render-approval-"));
		const daemon = createLocalDaemon({ rootDir });

		const build = await handleBuildRun({
			daemon,
			goal: "resume render flow",
			workspaceId: "w1",
			initiativeId: "i1",
		});

		if (!build.approvalRequestId) {
			throw new Error("Expected build approval id for render test");
		}

		const approval = await handleApprovals({
			daemon,
			action: "approve",
			id: build.approvalRequestId,
		});

		const output = renderCliOutput({
			parsed: parseCliArgs(["approvals", "approve", build.approvalRequestId]),
			result: approval,
		});

		expect(output).toContain("artifact:");
		expect(output).toContain("artifact path:");
		expect(output).toContain("completed");

		rmSync(rootDir, { recursive: true, force: true });
	});

	it("renders approval queue entries as terminal cards", () => {
		const output = renderCliOutput({
			parsed: parseCliArgs(["approvals"]),
			result: {
				approvals: [
					{
						id: "approval-1",
						lane: "ops-automate",
						status: "pending",
						target: "Draft outreach for Acme",
					},
				],
				summary: {
					total: 1,
					pending: 1,
					approved: 0,
					denied: 0,
					nextAction: "Review the approval queue and resolve pending requests.",
				},
			},
		});

		expect(output).toContain("Approval queue");
		expect(output).toContain("╭─ Approval 1");
		expect(output).toContain("shortcut: /approve approval-1 or /deny approval-1");
	});

	it("renders trace, artifact, and memory inventories as operator cards", () => {
		const tracesOutput = renderCliOutput({
			parsed: parseCliArgs(["traces"]),
			result: {
				traces: [
					{
						id: "trace-1",
						lane: "research",
						status: "completed",
						logFilePath: "/tmp/trace.log",
					},
				],
				summary: {
					total: 1,
					awaitingApproval: 0,
					completed: 1,
					failed: 0,
				},
			},
		});
		expect(tracesOutput).toContain("╭─ Trace summary");
		expect(tracesOutput).toContain("╭─ Trace 1");
		expect(tracesOutput).toContain("shortcut: opengtm traces show trace-1");

		const artifactsOutput = renderCliOutput({
			parsed: parseCliArgs(["artifacts"]),
			result: {
				artifacts: [
					{
						id: "artifact-1",
						lane: "research",
						title: "Research output",
						traceRef: "trace-1",
					},
				],
				summary: {
					total: 1,
					byLane: { research: 1 },
				},
			},
		});
		expect(artifactsOutput).toContain("╭─ Artifact summary");
		expect(artifactsOutput).toContain("╭─ Artifact 1");
		expect(artifactsOutput).toContain("shortcut: /artifacts or opengtm artifacts");

		const memoryOutput = renderCliOutput({
			parsed: parseCliArgs(["memory"]),
			result: {
				memory: [
					{
						id: "memory-1",
						memoryType: "working",
						scope: "account:acme",
						contentRef: "/tmp/memory.json",
					},
				],
				summary: {
					total: 1,
					working: 1,
					episodic: 0,
					semantic: 0,
				},
			},
		});
		expect(memoryOutput).toContain("╭─ Memory summary");
		expect(memoryOutput).toContain("╭─ Memory 1");
		expect(memoryOutput).toContain("shortcut: /memory or opengtm memory");
	});

	it("renders control-plane inventories as operator cards", () => {
		const connectorsOutput = renderCliOutput({
			parsed: parseCliArgs(["connector", "list"]),
			result: {
				connectors: [{ provider: "mock", family: "docs-knowledge" }],
				summary: { total: 1, families: ["docs-knowledge"] },
			},
		});
		expect(connectorsOutput).toContain("╭─ Connector summary");
		expect(connectorsOutput).toContain("╭─ Connector 1");
		expect(connectorsOutput).toContain("shortcut: opengtm connector list");

		const daemonOutput = renderCliOutput({
			parsed: parseCliArgs(["daemon", "status"]),
			result: {
				status: "running",
				workspace: "Demo",
				initiative: "Launch",
				laneSummary: { research: 2 },
				traceStatusSummary: { completed: 3 },
				approvalStatusSummary: { pending: 1 },
				counts: { workItems: 4, traces: 3, approvals: 1, feedback: 2, artifacts: 6, memory: 2 },
			},
		});
		expect(daemonOutput).toContain("╭─ Daemon");
		expect(daemonOutput).toContain("shortcut: opengtm daemon status");
		expect(daemonOutput).toContain("shortcut: opengtm traces");

		const statusOutput = renderCliOutput({
			parsed: parseCliArgs(["status"]),
			result: {
				kind: "status",
				workspace: { name: "Demo", id: "w1", initiativeTitle: "Launch", runtimeDir: ".opengtm/runtime" },
				controlPlane: {
					provider: { id: "mock", label: "Mock provider", configured: true, authMode: "none", maskedValue: null },
					model: "mock-0",
					sandbox: { runtime: "seatbelt", available: true, profile: "read-only" },
				},
				support: { liveWorkflows: 8, referenceOnlyWorkflows: 0, builtInSkills: 18, builtInAgents: 7 },
				inventory: { traces: 4, approvals: 1, feedback: 2, artifacts: 6, memory: 3 },
			},
		});
		expect(statusOutput).toContain("╭─ Workspace");
		expect(statusOutput).toContain("╭─ Control plane");
		expect(statusOutput).toContain("╭─ Support surface");
		expect(statusOutput).toContain("╭─ Next action");
		expect(statusOutput).toContain("shortcut: opengtm session runtime");
		expect(statusOutput).toContain("shortcut: opengtm auth status");
		expect(statusOutput).toContain("shortcut: opengtm workflow list");
		expect(statusOutput).toContain("shortcut: opengtm traces");

		const authOutput = renderCliOutput({
			parsed: parseCliArgs(["auth", "status"]),
			result: {
				kind: "auth",
				provider: { id: "openai", label: "OpenAI", authMode: "api-key" },
				configured: true,
				backend: "local-file",
				maskedValue: "sk-****",
			},
		});
		expect(authOutput).toContain("╭─ Provider");
		expect(authOutput).toContain("╭─ Next action");
		expect(authOutput).toContain("shortcut: opengtm auth login openai --api-key-env <ENV_VAR>");

		const providersOutput = renderCliOutput({
			parsed: parseCliArgs(["provider", "list"]),
			result: {
				kind: "providers",
				currentProvider: "mock",
				providers: [
					{ id: "mock", label: "Mock provider", supportTier: "live", authMode: "none", configured: true, description: "Fixture runtime" },
				],
			},
		});
		expect(providersOutput).toContain("╭─ Provider summary");
		expect(providersOutput).toContain("╭─ Provider 1");
		expect(providersOutput).toContain("╭─ Next action");
		expect(providersOutput).toContain("shortcut: opengtm provider list");
		expect(providersOutput).toContain("shortcut: opengtm provider use mock");

		const modelsOutput = renderCliOutput({
			parsed: parseCliArgs(["models", "list"]),
			result: {
				kind: "models",
				provider: { id: "mock", label: "Mock provider" },
				currentModel: "mock-0",
				models: [{ id: "mock-0", current: true }],
			},
		});
		expect(modelsOutput).toContain("╭─ Model summary");
		expect(modelsOutput).toContain("╭─ Model 1");
		expect(modelsOutput).toContain("╭─ Next action");
		expect(modelsOutput).toContain("shortcut: opengtm models list");
		expect(modelsOutput).toContain("shortcut: opengtm models use mock-0");

		const sandboxOutput = renderCliOutput({
			parsed: parseCliArgs(["sandbox", "profile", "list"]),
			result: {
				kind: "sandbox",
				action: "profile-list",
				runtime: "seatbelt",
				available: true,
				currentProfile: "read-only",
				status: "ready",
				profiles: [{ id: "read-only", label: "Read only", description: "No mutations", restrictions: ["network off"] }],
			},
		});
		expect(sandboxOutput).toContain("╭─ Sandbox summary");
		expect(sandboxOutput).toContain("╭─ Profile 1");
		expect(sandboxOutput).toContain("╭─ Next action");
		expect(sandboxOutput).toContain("shortcut: opengtm sandbox status");
		expect(sandboxOutput).toContain("shortcut: opengtm sandbox explain --profile read-only");
	});

	it("renders workflow, feedback, skills, and agents as operator cards", () => {
		const workflowCatalogOutput = renderCliOutput({
			parsed: parseCliArgs(["workflow"]),
			result: {
				workflows: [
					{
						id: "sdr.lead_research",
						name: "Lead Research",
						lane: "research",
						persona: "SDR",
						requiresApproval: false,
						supportTier: "live",
					},
				],
				summary: {
					total: 1,
					byLane: { research: 1 },
					bySupportTier: { live: 1 },
					canonicalScenarioId: "crm.roundtrip",
				},
			},
		});
		expect(workflowCatalogOutput).toContain("╭─ Workflow summary");
		expect(workflowCatalogOutput).toContain("╭─ Workflow 1");
		expect(workflowCatalogOutput).toContain('shortcut: opengtm workflow run sdr.lead_research "<goal>"');

		const workflowRunOutput = renderCliOutput({
			parsed: parseCliArgs(["workflow", "run", "sdr.lead_research", "Research Acme"]),
			result: {
				workflow: { id: "sdr.lead_research", name: "Lead Research", lane: "research", persona: "SDR", fixtureSetId: "lead-research" },
				workflowRun: { id: "run-1", status: "completed" },
				supportTier: "live",
				canonicalScenarioId: null,
				traceId: "trace-1",
				logFilePath: "/tmp/trace.log",
				artifactId: "artifact-1",
				artifactPath: "/tmp/artifact.json",
			},
		});
		expect(workflowRunOutput).toContain("╭─ Workflow summary");
		expect(workflowRunOutput).toContain("╭─ References");
		expect(workflowRunOutput).toContain("shortcut: opengtm traces show trace-1");
		expect(workflowRunOutput).toContain("╭─ Next action");

		const feedbackOutput = renderCliOutput({
			parsed: parseCliArgs(["feedback"]),
			result: {
				feedback: [
					{ id: "feedback-1", action: "approve", actor: "operator", traceId: "trace-1", message: "Looks good" },
				],
				summary: { total: 1, byAction: { approve: 1 } },
				trace: { id: "trace-1" },
			},
		});
		expect(feedbackOutput).toContain("╭─ Feedback summary");
		expect(feedbackOutput).toContain("╭─ Feedback 1");
		expect(feedbackOutput).toContain("shortcut: opengtm traces show trace-1");
		expect(feedbackOutput).toContain("╭─ Next action");

		const skillsOutput = renderCliOutput({
			parsed: parseCliArgs(["skill", "list"]),
			result: {
				kind: "skills",
				skills: [
					{ id: "outreach", name: "Outreach", persona: "SDR", source: "builtin", summary: "Drafts outbound" },
				],
			},
		});
		expect(skillsOutput).toContain("╭─ Skill summary");
		expect(skillsOutput).toContain("╭─ Skill 1");
		expect(skillsOutput).toContain("shortcut: opengtm skill show outreach");
		expect(skillsOutput).toContain("╭─ Next action");

		const agentsOutput = renderCliOutput({
			parsed: parseCliArgs(["agent", "list"]),
			result: {
				kind: "agents",
				agents: [
					{ id: "researcher", name: "Researcher", persona: "research", source: "builtin", description: "Finds GTM context" },
				],
			},
		});
		expect(agentsOutput).toContain("╭─ Agent summary");
		expect(agentsOutput).toContain("╭─ Agent 1");
		expect(agentsOutput).toContain("shortcut: opengtm agent show researcher");
		expect(agentsOutput).toContain("╭─ Next action");
	});

	it("renders workflow support tiers and canonical scenario notes", async () => {
		const rootDir = mkdtempSync(join(tmpdir(), "opengtm-render-workflow-"));
		const daemon = createLocalDaemon({ rootDir });

		const catalog = await handleWorkflowCatalog();
		const catalogOutput = renderCliOutput({
			parsed: parseCliArgs(["workflow"]),
			result: catalog,
		});

		expect(catalogOutput).toContain("support tiers:");
		expect(catalogOutput).toContain("canonical scenario: crm.roundtrip");
		expect(catalogOutput).not.toContain("reference-only");
		expect(catalogOutput).toContain("live: 11");

		const workflowRun = await handleWorkflowRun({
			daemon,
			workflowId: "sdr.lead_research",
			goal: "research acme expansion",
			workspaceId: "w1",
			initiativeId: "i1",
		});

		const workflowOutput = renderCliOutput({
			parsed: parseCliArgs(["run", "workflow", "sdr.lead_research", "research acme expansion"]),
			result: workflowRun,
		});

		expect(workflowOutput).toContain("support tier: live");
		expect(workflowOutput).toContain("canonical scenario: none");
		expect(workflowOutput).toContain("Relationship state: warm-prospect");
		expect(workflowOutput).toContain("Reference prior touchpoints");

		const sequenceRun = await handleWorkflowRun({
			daemon,
			workflowId: "sdr.outreach_sequence",
			goal: "sequence acme expansion",
			workspaceId: "w1",
			initiativeId: "i1",
		});
		const sequenceOutput = renderCliOutput({
			parsed: parseCliArgs(["run", "workflow", "sdr.outreach_sequence", "sequence acme expansion"]),
			result: sequenceRun,
		});
		expect(sequenceOutput).toContain("support tier: live");
		expect(sequenceOutput).toContain("awaiting-approval");

		const renewalRun = await handleWorkflowRun({
			daemon,
			workflowId: "cs.renewal_prep",
			goal: "prepare renewal for acme",
			workspaceId: "w1",
			initiativeId: "i1",
		});
		const renewalOutput = renderCliOutput({
			parsed: parseCliArgs(["run", "workflow", "cs.renewal_prep", "prepare renewal for acme"]),
			result: renewalRun,
		});
		expect(renewalOutput).toContain("support tier: live");
		expect(renewalOutput).toContain("Review the renewal dossier");

		const dealRiskRun = await handleWorkflowRun({
			daemon,
			workflowId: "ae.deal_risk_scan",
			goal: "scan deal risk for acme",
			workspaceId: "w1",
			initiativeId: "i1",
		});
		const dealRiskOutput = renderCliOutput({
			parsed: parseCliArgs(["run", "workflow", "ae.deal_risk_scan", "scan deal risk for acme"]),
			result: dealRiskRun,
		});
		expect(dealRiskOutput).toContain("support tier: live");
		expect(dealRiskOutput).toContain("Review the deal dossier");

		rmSync(rootDir, { recursive: true, force: true });
	});

	it("renders interactive runtime control-plane and lineage summaries", () => {
		const output = renderCliOutput({
			parsed: parseCliArgs(["session", "runtime"]),
			result: {
				kind: "session-runtime",
				session: {
					sessionId: "sess-1",
					status: "active",
					focusEntity: "Acme",
					focusType: "account",
					lastIntent: "deal-risk",
					lastSpecialist: "deal-risk-analyst",
					lastWorkflowId: "ae.deal_risk_scan",
					lastTraceId: "trace-1",
					advance: {
						runId: "advance-1",
						status: "waiting-for-approval",
						startedAt: "2025-01-01T00:00:00Z",
						updatedAt: "2025-01-01T00:05:00Z",
						stepsRequested: 3,
						stepsExecuted: 1,
						stopReason: "approval-gate",
						lastCardTitle: "Draft outreach",
						lastCommand: "opengtm workflow run sdr.outreach_compose Draft outreach for Acme",
					},
					lineage: {
						lead: null,
						account: {
							entity: "Acme",
							checkpointId: "checkpoint-account",
							sourceArtifacts: 4,
						},
						deal: {
							entity: "Acme Renewal",
							checkpointId: "checkpoint-deal",
							sourceArtifacts: 6,
						},
					},
				},
				controlPlane: {
					provider: {
						id: "openai",
						label: "OpenAI",
						configured: true,
						model: "gpt-5.2",
					},
					sandbox: {
						runtime: "seatbelt",
						available: true,
						profile: "read-only",
					},
				},
				inventory: {
					pendingApprovals: 1,
					totalApprovals: 3,
					traces: 7,
					latestTrace: {
						id: "trace-1",
						workflowId: "ae.deal_risk_scan",
						status: "completed",
					},
				},
				recommendedActions: [
					"/approve approval-1 to let the runtime continue",
					"Ask “Why was this blocked?” or run /traces for more evidence",
				],
				actionCards: [
					{
						title: "Approve blocked motion",
						reason: "Resume the paused GTM motion from the current approval gate.",
						commandArgs: ["approvals", "approve", "approval-1"],
					},
				],
				nextAction: "Continue the GTM runtime.",
			},
		});

		expect(output).toContain("Interactive runtime");
		expect(output).toContain("╭─ Session focus");
		expect(output).toContain("╭─ Governance");
		expect(output).toContain("╭─ Advance status");
		expect(output).toContain("shortcut: opengtm session resume");
		expect(output).toContain("provider: OpenAI (configured)");
		expect(output).toContain("Runtime lineage");
		expect(output).toContain("Recommended actions");
		expect(output).toContain("Action cards");
		expect(output).toContain("╭─ Action card 1");
		expect(output).toContain("Approve blocked motion");
		expect(output).toContain("/approve approval-1");
		expect(output).toContain("account — Acme");
		expect(output).toContain("deal — Acme Renewal");
	});

	it("renders persisted session action execution output", () => {
		const output = renderCliOutput({
			parsed: parseCliArgs(["session", "do"]),
			result: {
				kind: "session-action",
				executed: true,
				slot: 1,
				output: "Runtime action card\n  slot: 1\n  title: Draft outreach",
				nextAction: "Use `opengtm session runtime` to continue.",
			},
		});

		expect(output).toContain("Runtime action card");
		expect(output).toContain("Next action");
		expect(output).toContain("session runtime");
	});

	it("renders persisted session cards with slot shortcuts", () => {
		const output = renderCliOutput({
			parsed: parseCliArgs(["session", "cards"]),
			result: {
				kind: "session-cards",
				refreshed: true,
				session: {
					sessionId: "sess-1",
					status: "active",
					focusEntity: "Acme",
					focusType: "lead",
				},
				actionCards: [
					{
						title: "Draft outreach",
						reason: "Continue the lead motion into an approval-gated outbound draft.",
						commandArgs: ["workflow", "run", "sdr.outreach_compose", "Draft outreach for Acme"],
					},
				],
				nextAction: "Run `opengtm session do 1` to execute the primary card.",
			},
		});

		expect(output).toContain("Interactive session cards");
		expect(output).toContain("╭─ Action card 1");
		expect(output).toContain("title: Draft outreach");
		expect(output).toContain("cards source: refreshed");
		expect(output).toContain("shortcut: /do 1");
		expect(output).toContain("session do 1");
	});

	it("renders session progress with current and historical advance cards", () => {
		const output = renderCliOutput({
			parsed: parseCliArgs(["session", "progress"]),
			result: {
				kind: "session-progress",
				session: {
					sessionId: "sess-1",
					status: "active",
					focusEntity: "Acme",
					focusType: "lead",
				},
				advance: {
					runId: "advance-2",
					status: "waiting-for-approval",
					stepsRequested: 3,
					stepsExecuted: 1,
					stopReason: "approval-gate",
					lastCardTitle: "Draft outreach",
					lastCommand: "opengtm workflow run sdr.outreach_compose Draft outreach for Acme",
				},
				history: [
					{
						runId: "advance-1",
						mode: "advance",
						finalStatus: "waiting-for-approval",
						stepsRequested: 3,
						stepsExecuted: 1,
						stopReason: "approval-gate",
						lastCardTitle: "Draft outreach",
						lastCommand: "opengtm workflow run sdr.outreach_compose Draft outreach for Acme",
					},
				],
			},
		});

		expect(output).toContain("Interactive session progress");
		expect(output).toContain("╭─ Current advance");
		expect(output).toContain("╭─ Advance history");
		expect(output).toContain("shortcut: opengtm session resume");
		expect(output).toContain("[run 1] advance / waiting-for-approval");
	});

	it("renders session status, query, and transcript as operator cards", () => {
		const statusOutput = renderCliOutput({
			parsed: parseCliArgs(["session", "status"]),
			result: {
				kind: "session-status",
				session: {
					sessionId: "sess-1",
					status: "active",
					transcriptPath: "/tmp/transcript.jsonl",
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:01:00Z",
					lastTraceId: "trace-1",
					lastApprovalRequestId: "approval-1",
					lastArtifactId: "artifact-1",
					lastMemoryId: "memory-1",
					lastWorkflowId: "workflow-1",
					focusEntity: "Acme",
					focusType: "account",
					lastIntent: "account-health",
					lastSpecialist: "account-health-analyst",
					advance: {
						runId: "advance-1",
						status: "waiting-for-approval",
						startedAt: "2025-01-01T00:00:00Z",
						updatedAt: "2025-01-01T00:05:00Z",
						stepsRequested: 3,
						stepsExecuted: 1,
						stopReason: "approval-gate",
						lastCardTitle: "Draft outreach",
						lastCommand: "opengtm workflow run sdr.outreach_compose Draft outreach for Acme",
					},
				},
			},
		});
		expect(statusOutput).toContain("╭─ Session");
		expect(statusOutput).toContain("╭─ Advance status");
		expect(statusOutput).toContain("╭─ Next action");
		expect(statusOutput).toContain("shortcut: opengtm session transcript");
		expect(statusOutput).toContain("shortcut: opengtm session resume");

		const queryOutput = renderCliOutput({
			parsed: parseCliArgs(["session", "summary"]),
			result: {
				kind: "session-query",
				queryType: "entity-summary",
				specialist: "researcher",
				entity: "Acme",
				summary: ["Current GTM focus: Acme"],
				approvals: [{ id: "approval-1", status: "pending", actionSummary: "Draft outreach approval" }],
				traces: [{ id: "trace-1", workflowId: "sdr.outreach_compose", status: "awaiting-approval" }],
				artifacts: [{ id: "artifact-1", title: "Account dossier", path: "/tmp/artifact.json" }],
				memory: [{ id: "memory-1", memoryType: "working", path: "/tmp/memory.json" }],
			},
		});
		expect(queryOutput).toContain("╭─ Operator summary");
		expect(queryOutput).toContain("╭─ Summary");
		expect(queryOutput).toContain("╭─ Next action");
		expect(queryOutput).toContain("╭─ Approval 1");
		expect(queryOutput).toContain("╭─ Trace 1");
		expect(queryOutput).toContain("╭─ Artifact 1");
		expect(queryOutput).toContain("╭─ Memory 1");
		expect(queryOutput).toContain("shortcut: opengtm traces show trace-1");
		expect(queryOutput).toContain("shortcut: /artifacts or opengtm artifacts");
		expect(queryOutput).toContain("shortcut: /memory or opengtm memory");

		const transcriptOutput = renderCliOutput({
			parsed: parseCliArgs(["session", "transcript"]),
			result: {
				kind: "session-transcript",
				session: { sessionId: "sess-1", status: "active", transcriptPath: "/tmp/transcript.jsonl" },
				entries: [{ createdAt: "2025-01-01T00:00:00Z", role: "user", content: "Research Acme" }],
			},
		});
		expect(transcriptOutput).toContain("╭─ Session");
		expect(transcriptOutput).toContain("╭─ Message 1");
		expect(transcriptOutput).toContain("╭─ Next action");
		expect(transcriptOutput).toContain("shortcut: opengtm session transcript");

		const sanitizedTranscriptOutput = renderCliOutput({
			parsed: parseCliArgs(["session", "transcript"]),
			result: {
				kind: "session-transcript",
				session: { sessionId: "sess-2", status: "active", transcriptPath: "/tmp/transcript.jsonl" },
				entries: [{
					createdAt: "2025-01-01T00:00:00Z",
					role: "assistant",
					content: "\u001b[31mred\u001b[0m\u0007 bell",
				}],
			},
		});
		expect(sanitizedTranscriptOutput).toContain("content: red bell");
		expect(sanitizedTranscriptOutput).not.toContain("\u001b[31m");
		expect(sanitizedTranscriptOutput).not.toContain("\u0007");

		const hardenedTranscriptOutput = renderCliOutput({
			parsed: parseCliArgs(["session", "transcript"]),
			result: {
				kind: "session-transcript",
				session: { sessionId: "sess-3", status: "active", transcriptPath: "/tmp/transcript.jsonl" },
				entries: [{
					createdAt: "2025-01-01T00:00:00Z",
					role: "assistant",
					content: "\u001b lone esc \u009b csi",
				}],
			},
		});
		expect(hardenedTranscriptOutput).toContain("content:  lone esc  csi");
		expect(hardenedTranscriptOutput).not.toContain("\u001b");
		expect(hardenedTranscriptOutput).not.toContain("\u009b");
	});

	it("renders learning review and session action next steps as cards", () => {
		const learnOutput = renderCliOutput({
			parsed: parseCliArgs(["learn", "review"]),
			result: {
				kind: "learn",
				dominantWorkflow: "crm.roundtrip",
				generated: true,
				artifactId: "artifact-1",
				artifactPath: "/tmp/learn.json",
				evidence: { deniedApprovals: 1, reviseFeedback: 2, deniedFeedback: 0 },
				candidateSkillPath: "/tmp/skill.md",
				nextAction: "Review generated learning artifacts.",
			},
		});
		expect(learnOutput).toContain("╭─ Operator summary");
		expect(learnOutput).toContain("╭─ Evidence");
		expect(learnOutput).toContain("╭─ Next action");
		expect(learnOutput).toContain("shortcut: opengtm skill list");

		const compactErrorOutput = renderCliOutput({
			parsed: parseCliArgs(["session", "compact"]),
			result: {
				kind: "session-compact",
				session: { sessionId: "sess-4", status: "active", transcriptPath: "/tmp/transcript.jsonl" },
				error: "Interactive transcript could not be read safely for compaction: EACCES",
				nextAction: "Repair the transcript file or start a fresh session before retrying compaction.",
			},
		});
		expect(compactErrorOutput).toContain("╭─ Compaction status");
		expect(compactErrorOutput).toContain("error: Interactive transcript could not be read safely for compaction: EACCES");

		const compactWriteErrorOutput = renderCliOutput({
			parsed: parseCliArgs(["session", "compact"]),
			result: {
				kind: "session-compact",
				session: { sessionId: "sess-5", status: "active", transcriptPath: "/tmp/transcript.jsonl" },
				error: "Interactive transcript compaction could not be completed safely: EACCES",
				nextAction: "Repair the transcript file or start a fresh session before retrying compaction.",
			},
		});
		expect(compactWriteErrorOutput).toContain("error: Interactive transcript compaction could not be completed safely: EACCES");

		const sessionActionOutput = renderCliOutput({
			parsed: parseCliArgs(["session", "do"]),
			result: {
				kind: "session-action",
				executed: true,
				output: "Runtime action card\n  slot: 1\n  title: Draft outreach",
				nextAction: "Continue the runtime loop.",
			},
		});
		expect(sessionActionOutput).toContain("╭─ Next action");

		const sessionLaunchOutput = renderCliOutput({
			parsed: parseCliArgs(["session"]),
			result: {
				kind: "session-launch",
				requiresTty: true,
				cwd: "/tmp/demo",
				nextAction: "Run `opengtm` in a terminal to start the harness session.",
			},
		});
		expect(sessionLaunchOutput).toContain("╭─ Operator summary");
		expect(sessionLaunchOutput).toContain("shortcut: opengtm");
	});

	it("renders canonical eval dimensions and pass state", async () => {
		const result = await handleEvals({ suite: "canonical" });
		const output = renderCliOutput({
			parsed: parseCliArgs(["evals", "run", "canonical"]),
			result,
		});

		expect(output).toContain("suite: canonical");
		expect(output).toContain("╭─ Operator summary");
		expect(output).toContain("╭─ Dimensions");
		expect(output).toContain("pass: true");
		expect(output).toContain("canonical scenario: crm.roundtrip");
		expect(output).toContain("transferability:");
		expect(output).toContain("Ablation deltas");
	});

	it("renders longitudinal eval dimensions and pass state", async () => {
		const result = await handleEvals({ suite: "longitudinal" });
		const output = renderCliOutput({
			parsed: parseCliArgs(["evals", "run", "longitudinal"]),
			result,
		});

		expect(output).toContain("suite: longitudinal");
		expect(output).toContain("╭─ Operator summary");
		expect(output).toContain("pass: true");
		expect(output).toContain("successRate:");
		expect(output).toContain("rerunContinuity:");
	});
});
