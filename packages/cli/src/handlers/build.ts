import {
	createArtifactRecord,
	createRunTrace,
	transitionWorkItem,
	updateRunTrace,
} from "@opengtm/core";
import type { OpenGtmLocalDaemon } from "@opengtm/daemon";
import { createJsonlRunLogger } from "@opengtm/observability";
import {
	createApprovalRequestForDecision,
	createPolicyDecisionFromActionWithConfig,
	loadPolicyConfig,
} from "@opengtm/policy";
import { transitionApprovalRequest } from "@opengtm/core";
import type {
	OpenGtmApprovalRequest,
	OpenGtmRunTrace,
	OpenGtmWorkItem,
} from "@opengtm/types";
import type { OpenGtmAutonomyMode } from "../autonomy.js";

function createBuildContinuationArtifact(args: {
	workItem: OpenGtmWorkItem;
	trace: OpenGtmRunTrace;
	approval: OpenGtmApprovalRequest;
	executionMode?: string;
}) {
	return {
		lane: args.workItem.ownerLane,
		workItemId: args.workItem.id,
		workItemTitle: args.workItem.title,
		goal: args.workItem.goal,
		approvalId: args.approval.id,
		approvalStatus: args.approval.status,
		executionMode: args.executionMode ?? "approved-resume",
		traceId: args.trace.id,
		workflowState: "completed",
		completedPhases: ["spec", "implement", "validate", "handoff"],
		result: `Build continuation completed for ${args.workItem.goal}`,
	};
}

export async function continueApprovedBuildWorkflow(args: {
	daemon: OpenGtmLocalDaemon;
	approval: OpenGtmApprovalRequest;
	workItem: OpenGtmWorkItem;
	trace: OpenGtmRunTrace;
	executionMode?: "approved-resume" | "full-autonomy" | "dry-run";
}) {
	const startedAtMs = Date.now();
	const logger = createJsonlRunLogger({
		rootDir: args.daemon.storage.rootDir,
		runId: args.trace.id,
		traceId: args.trace.id,
	});

	const traceWithLog = args.trace.logFilePath
		? args.trace
		: updateRunTrace(args.trace, { logFilePath: logger.logFilePath });

	const { upsertRecord, writeArtifactBlob } = await import("@opengtm/storage");

	const queuedWorkItem = args.workItem.status === "queued"
		? args.workItem
		: transitionWorkItem(args.workItem, "queued");
	const runningWorkItem = transitionWorkItem(queuedWorkItem, "running");
	const runningTrace = {
		...updateRunTrace(traceWithLog, {
			status: "running",
			steps: [
				{ name: "spec", status: "completed" },
				{ name: "implement", status: "running" },
				{ name: "validate", status: "pending" },
				{ name: "handoff", status: "pending" },
			],
		}),
		artifactIds: traceWithLog.artifactIds,
	};

	upsertRecord(args.daemon.storage, "work_items", runningWorkItem);
	upsertRecord(args.daemon.storage, "run_traces", runningTrace);

	logger.log("run.resume", {
		lane: args.workItem.ownerLane,
		approvalRequestId: args.approval.id,
		workItemId: args.workItem.id,
		traceId: runningTrace.id,
	});

	try {
		const artifact = createArtifactRecord({
			workspaceId: args.workItem.workspaceId,
			initiativeId: args.workItem.initiativeId,
			kind: "trace",
			lane: args.workItem.ownerLane,
			title: `Build continuation: ${args.workItem.goal}`,
			traceRef: runningTrace.id,
			provenance: [
				"opengtm:build-approval-resume",
				`approval:${args.approval.id}`,
			],
		});

		const artifactPath = writeArtifactBlob(args.daemon.storage, {
			workspaceSlug: "global",
			artifactId: artifact.id,
			content: createBuildContinuationArtifact({
				workItem: args.workItem,
				trace: runningTrace,
				approval: args.approval,
				executionMode: args.executionMode,
			}),
		});

		const storedArtifact = {
			...artifact,
			contentRef: artifactPath,
			sourceIds: [args.approval.id],
			traceRef: runningTrace.id,
		};

		upsertRecord(args.daemon.storage, "artifacts", storedArtifact);

		logger.log("artifact.created", {
			artifactId: storedArtifact.id,
			artifactPath,
		});

		const completedWorkItem = transitionWorkItem(runningWorkItem, "completed");
		const completedTrace = {
			...updateRunTrace(runningTrace, {
				status: "completed",
				steps: [
					{ name: "spec", status: "completed" },
					{ name: "implement", status: "completed" },
					{ name: "validate", status: "completed" },
					{ name: "handoff", status: "completed" },
				],
				endedAt: new Date().toISOString(),
			}),
			artifactIds: [...runningTrace.artifactIds, storedArtifact.id],
		};

		upsertRecord(args.daemon.storage, "work_items", completedWorkItem);
		upsertRecord(args.daemon.storage, "run_traces", completedTrace);

		logger.finalize({
			status: completedTrace.status,
			durationMs: Date.now() - startedAtMs,
			approvalRequestId: args.approval.id,
			artifactId: storedArtifact.id,
		});

		return {
			workItem: completedWorkItem,
			trace: completedTrace,
			artifact: storedArtifact,
			artifactPath,
		};
	} catch (err) {
		const e = err as Error & { stack?: string };
		logger.log(
			"run.error",
			{
				message: typeof e?.message === "string" ? e.message : String(err),
				stack: typeof e?.stack === "string" ? e.stack : undefined,
			},
			"error",
		);

		const failedWorkItem = transitionWorkItem(runningWorkItem, "failed");
		const failedTrace = {
			...updateRunTrace(runningTrace, {
				status: "failed",
				endedAt: new Date().toISOString(),
			}),
			artifactIds: runningTrace.artifactIds,
		};

		upsertRecord(args.daemon.storage, "work_items", failedWorkItem);
		upsertRecord(args.daemon.storage, "run_traces", failedTrace);

		logger.finalize({
			status: "failed",
			durationMs: Date.now() - startedAtMs,
			approvalRequestId: args.approval.id,
		});

		throw err;
	}
}

export async function handleBuildRun(args: {
	daemon: OpenGtmLocalDaemon;
	goal: string;
	workspaceId?: string;
	initiativeId?: string;
	autonomyMode?: OpenGtmAutonomyMode;
	workflowId?: string | null;
	workflowRunId?: string | null;
	persona?: string | null;
	fixtureSetId?: string | null;
}) {
	const workspaceId = args.workspaceId || args.daemon.workspace?.id;
	if (!workspaceId) {
		throw new Error('No workspace. Run "opengtm init" first.');
	}

	const workItem = args.daemon.createWorkItem({
		workspaceId,
		initiativeId: args.initiativeId || "unknown",
		workflowId: args.workflowId || null,
		workflowRunId: args.workflowRunId || null,
		ownerLane: "build-integrate",
		title: `Build: ${args.goal}`,
		goal: args.goal,
		status: args.autonomyMode === "background" ? "queued" : "awaiting-approval",
	});

	if (args.autonomyMode === "background") {
		const trace = createRunTrace({
			workItemId: workItem.id,
			workflowId: workItem.workflowId,
			lane: "build-integrate",
			persona: args.persona || null,
			fixtureSetId: args.fixtureSetId || null,
			status: "queued",
			steps: [
				{ name: "spec", status: "completed" },
				{ name: "implement", status: "queued" },
				{ name: "validate", status: "queued" },
				{ name: "handoff", status: "queued" },
			],
		});
		const { upsertRecord } = await import("@opengtm/storage");
		upsertRecord(args.daemon.storage, "work_items", workItem);
		upsertRecord(args.daemon.storage, "run_traces", trace);

		return {
			workItem,
			traceId: trace.id,
			traceStatus: trace.status,
			summary: {
				lane: workItem.ownerLane,
				workflowState: trace.status,
				autonomyMode: "background",
				approvalState: "deferred",
				riskLevel: workItem.riskLevel,
				traceRef: trace.id,
				nextAction:
					"Background autonomy queued the build workflow. Continue it from the worker/daemon path.",
			},
		};
	}

	const startedAtMs = Date.now();

	const policyConfig = await loadPolicyConfig({ cwd: process.cwd() });
	const decision = createPolicyDecisionFromActionWithConfig(
		{
			workItemId: workItem.id,
			lane: "build-integrate",
			actionType: "write-repo",
			target: args.goal,
		},
		policyConfig,
	);

	const approval = createApprovalRequestForDecision({
		workspaceId,
		decision,
		actionSummary: `Build action requires approval: ${args.goal}`,
	});

	const trace = createRunTrace({
		workItemId: workItem.id,
		workflowId: workItem.workflowId,
		lane: "build-integrate",
		persona: args.persona || null,
		fixtureSetId: args.fixtureSetId || null,
		status: "awaiting-approval",
		steps: [
			{ name: "spec", status: "completed" },
			{ name: "implement", status: "awaiting-approval" },
			{ name: "validate", status: "pending" },
			{ name: "handoff", status: "pending" },
		],
		policyDecisionIds: [decision.id],
		artifactIds: [],
	});

	const logger = createJsonlRunLogger({
		rootDir: args.daemon.storage.rootDir,
		runId: trace.id,
		traceId: trace.id,
	});

	const traceWithLog = updateRunTrace(trace, {
		logFilePath: logger.logFilePath,
		debugBundlePath: logger.logFilePath,
	});

	logger.log("run.start", {
		lane: "build-integrate",
		goal: args.goal,
		workItemId: workItem.id,
		traceId: traceWithLog.id,
		logFilePath: logger.logFilePath,
	});

	logger.log("approval.created", {
		approvalRequestId: approval.id,
		policyDecisionId: decision.id,
	});

	const { upsertRecord } = await import("@opengtm/storage");

	if (args.autonomyMode === "full" || args.autonomyMode === "dry-run") {
		const approvedApproval = transitionApprovalRequest(approval, "approved");
		upsertRecord(args.daemon.storage, "work_items", workItem);
		upsertRecord(args.daemon.storage, "policy_decisions", decision);
		upsertRecord(args.daemon.storage, "approval_requests", approvedApproval);
		upsertRecord(args.daemon.storage, "run_traces", traceWithLog);

		const continuation = await continueApprovedBuildWorkflow({
			daemon: args.daemon,
			approval: approvedApproval,
			workItem,
			trace: traceWithLog,
			executionMode: args.autonomyMode === "full" ? "full-autonomy" : "dry-run",
		});

		return {
			workItem: continuation.workItem,
			approvalRequestId: approvedApproval.id,
			traceId: continuation.trace.id,
			traceStatus: continuation.trace.status,
			logFilePath: continuation.trace.logFilePath,
			artifact: continuation.artifact,
			artifactPath: continuation.artifactPath,
			summary: {
				lane: continuation.workItem.ownerLane,
				workflowState: continuation.trace.status,
				autonomyMode: args.autonomyMode,
				approvalState: approvedApproval.status,
				riskLevel: approvedApproval.riskLevel,
				traceRef: continuation.trace.id,
				nextAction:
					args.autonomyMode === "full"
						? "Full autonomy completed the build workflow without waiting for manual approval."
						: "Dry-run autonomy completed a simulated build continuation artifact for operator review.",
			},
		};
	}
	try {
		upsertRecord(args.daemon.storage, "work_items", workItem);
		upsertRecord(args.daemon.storage, "policy_decisions", decision);
		upsertRecord(args.daemon.storage, "approval_requests", approval);
		upsertRecord(args.daemon.storage, "run_traces", traceWithLog);

		logger.finalize({
			status: traceWithLog.status,
			durationMs: Date.now() - startedAtMs,
			approvalRequestId: approval.id,
		});
	} catch (err) {
		const e = err as Error & { stack?: string };
		logger.log(
			"run.error",
			{
				message: typeof e?.message === "string" ? e.message : String(err),
				stack: typeof e?.stack === "string" ? e.stack : undefined,
			},
			"error",
		);
		logger.finalize({ status: "failed", durationMs: Date.now() - startedAtMs });
		throw err;
	}

	return {
		workItem,
		approvalRequestId: approval.id,
		traceId: traceWithLog.id,
		traceStatus: traceWithLog.status,
		logFilePath: traceWithLog.logFilePath,
			summary: {
				lane: workItem.ownerLane,
				workflowState: traceWithLog.status,
				autonomyMode: args.autonomyMode ?? "off",
				approvalState: approval.status,
			riskLevel: approval.riskLevel,
			traceRef: traceWithLog.id,
			nextAction:
				"Resolve the approval request before the build lane can write to the repo.",
		},
	};
}
