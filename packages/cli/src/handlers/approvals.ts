import {
	createFeedbackRecord,
	transitionApprovalRequest,
	transitionWorkItem,
	updateRunTrace,
} from "@opengtm/core";
import type { OpenGtmLocalDaemon } from "@opengtm/daemon";
import type {
	OpenGtmApprovalRequest,
	OpenGtmArtifactRecord,
	OpenGtmRunTrace,
	OpenGtmWorkItem,
} from "@opengtm/types";
import { createCanonicalActivity, parseCanonicalConnectorTargets } from "../canonical-crm.js";
import { writeRecoveryArtifact } from "../recovery.js";
import { continueApprovedBuildWorkflow } from "./build.js";
import { continueApprovedOpsWorkflow } from "./ops.js";

function summarizeApprovals(items: OpenGtmApprovalRequest[]) {
	return {
		total: items.length,
		pending: items.filter((item) => item.status === "pending").length,
		approved: items.filter((item) => item.status === "approved").length,
		denied: items.filter((item) => item.status === "denied").length,
		nextAction: items.some((item) => item.status === "pending")
			? "Run approvals approve <id> to resume, or approvals deny <id> to stop the blocked workflow."
			: "No pending approvals.",
	};
}

function updateTraceForApproval(
	trace: OpenGtmRunTrace,
	action: "approve" | "deny",
): OpenGtmRunTrace {
	const nextStatus = action === "approve" ? "queued" : "cancelled";
	const nextSteps = trace.steps.map((step) => {
		if (step.status !== "awaiting-approval") {
			return step;
		}

		return {
			...step,
			status: action === "approve" ? "queued" : "cancelled",
		};
	});

	return updateRunTrace(trace, {
		status: nextStatus,
		steps: nextSteps,
		endedAt: action === "deny" ? new Date().toISOString() : undefined,
	});
}

async function continueApprovedWorkflow(args: {
	daemon: OpenGtmLocalDaemon;
	approval: OpenGtmApprovalRequest;
	workItem: OpenGtmWorkItem;
	trace: OpenGtmRunTrace;
}) {
	if (args.workItem.ownerLane === "ops-automate") {
		return continueApprovedOpsWorkflow(args);
	}

	if (args.workItem.ownerLane !== "build-integrate") {
		return {
			workItem: args.workItem,
			trace: args.trace,
			artifact: null,
			artifactPath: null,
		};
	}

	return continueApprovedBuildWorkflow(args);
}

export async function handleApprovals(args: {
	daemon: OpenGtmLocalDaemon;
	action?: "list" | "approve" | "deny";
	id?: string;
}) {
	const action = args.action || "list";
	const { getRecord, listRecords, upsertRecord } = await import(
		"@opengtm/storage"
	);
	const storage = args.daemon.storage;
	const items = listRecords<OpenGtmApprovalRequest>(
		storage,
		"approval_requests",
	);

	if (action === "list") {
		return {
			approvals: items,
			summary: summarizeApprovals(items),
		};
	}

	if (!args.id) {
		throw new Error(`Approval id is required for approvals ${action}.`);
	}

	const approval = getRecord<OpenGtmApprovalRequest>(
		storage,
		"approval_requests",
		args.id,
	);
	if (!approval) {
		throw new Error(`Approval request not found: ${args.id}`);
	}

	const workItem = getRecord<OpenGtmWorkItem>(
		storage,
		"work_items",
		approval.workItemId,
	);
	if (!workItem) {
		throw new Error(
			`Linked work item not found for approval ${approval.id}: ${approval.workItemId}`,
		);
	}

	const trace = [...listRecords<OpenGtmRunTrace>(storage, "run_traces")]
		.reverse()
		.find((item) => item.workItemId === approval.workItemId);

	if (!trace) {
		throw new Error(
			`Linked trace not found for approval ${approval.id}: ${approval.workItemId}`,
		);
	}

	const nextApprovalStatus = action === "approve" ? "approved" : "denied";
	const updatedApproval = transitionApprovalRequest(
		approval,
		nextApprovalStatus,
	);
	const feedback = createFeedbackRecord({
		workspaceId: workItem.workspaceId,
		traceId: trace.id,
		approvalRequestId: approval.id,
		workflowId: workItem.workflowId,
		persona: trace.persona,
		action: action === "approve" ? "approve" : "deny",
		actor: "operator",
		message:
			action === "approve"
				? `Approved ${approval.actionSummary}`
				: `Denied ${approval.actionSummary}`,
	});

	upsertRecord(storage, "approval_requests", updatedApproval);
	upsertRecord(storage, "feedback_records", feedback);

	let updatedWorkItem: OpenGtmWorkItem;
	let updatedTrace: OpenGtmRunTrace;
	let updatedArtifact: OpenGtmArtifactRecord | null = null;
	let artifactPath: string | null = null;

	if (action === "approve") {
		const queuedWorkItem = transitionWorkItem(workItem, "queued");
		const queuedTrace = updateTraceForApproval(trace, action);

		upsertRecord(storage, "work_items", queuedWorkItem);
		upsertRecord(storage, "run_traces", queuedTrace);

		const continuation = await continueApprovedWorkflow({
			daemon: args.daemon,
			approval: updatedApproval,
			workItem: queuedWorkItem,
			trace: queuedTrace,
		});

		updatedWorkItem = continuation.workItem;
		updatedTrace = continuation.trace;
		updatedArtifact = continuation.artifact;
		artifactPath = continuation.artifactPath;
	} else {
		updatedWorkItem = transitionWorkItem(workItem, "cancelled");
		updatedTrace = updateTraceForApproval(trace, action);

		upsertRecord(storage, "work_items", updatedWorkItem);
		upsertRecord(storage, "run_traces", updatedTrace);

		const canonicalContext = parseCanonicalConnectorTargets(
			workItem.connectorTargets,
		);
		if (canonicalContext.dbFile && canonicalContext.leadId) {
			const crmActivity = createCanonicalActivity(canonicalContext.dbFile, {
				subject: `Denied outreach draft for ${workItem.goal}`,
				type: "note",
				relatedType: "lead",
				relatedId: canonicalContext.leadId,
			});
			updatedTrace = updateRunTrace(updatedTrace, {
				connectorCalls: [
					...updatedTrace.connectorCalls,
					{
						provider: "opengtm-crm",
						family: "crm",
						action: "mutate-connector",
						target: "activities",
						executionMode: "live",
						supportTier: "live",
						crmActivityId: crmActivity.id,
					},
				],
				observedFacts: [
					...updatedTrace.observedFacts,
					{
						kind: "recovery-semantics",
						scope: "approval-deny",
						checkpointId: canonicalContext.checkpointId,
						reversibleEffects: ["approval-artifact"],
						resumableEffects: [],
						operatorInterventionRequired: [],
						rollbackOutcome: "not-invoked",
						crmActivityId: crmActivity.id,
					},
				],
			});
			upsertRecord(storage, "run_traces", updatedTrace);
		}

		const recoveryReport = writeRecoveryArtifact({
			storage,
			workspaceId: workItem.workspaceId,
			initiativeId: workItem.initiativeId,
			lane: workItem.ownerLane,
			title: `Recovery report: ${workItem.goal}`,
			traceRef: updatedTrace.id,
			sourceIds: [approval.id],
			provenance: [
				"opengtm:recovery-report",
				`approval:${approval.id}`,
				"support-tier:live",
			],
			checkpoint: canonicalContext.checkpointId
				? {
						id: canonicalContext.checkpointId,
						createdAt: canonicalContext.checkpointCreatedAt || approval.createdAt,
					}
				: null,
			payload: {
				decision: "denied",
				workflowId: workItem.workflowId,
				recoverySemantics: {
					reversibleEffects: ["approval-artifact"],
					resumableEffects: [],
					operatorInterventionRequired: [],
				},
			},
		});

		updatedTrace = updateRunTrace(updatedTrace, {
			artifactIds: [...updatedTrace.artifactIds, recoveryReport.artifact.id],
			observedFacts: [
				...updatedTrace.observedFacts,
				{
					kind: "rollback-preview",
					scope: "approval-deny",
					artifactId: recoveryReport.artifact.id,
					candidateDeletionsByTable:
						recoveryReport.rollbackPreview?.candidateDeletionsByTable ?? {},
				},
			],
		});
		upsertRecord(storage, "run_traces", updatedTrace);
	}

	updatedTrace = updateRunTrace(updatedTrace, {
		feedbackEventIds: [...updatedTrace.feedbackEventIds, feedback.id],
	});
	upsertRecord(storage, "run_traces", updatedTrace);

	const updatedItems = listRecords<OpenGtmApprovalRequest>(
		storage,
		"approval_requests",
	);

	return {
		action,
		approval: updatedApproval,
		workItem: {
			id: updatedWorkItem.id,
			title: updatedWorkItem.title,
			status: updatedWorkItem.status,
		},
		trace: {
			id: updatedTrace.id,
			status: updatedTrace.status,
			logFilePath: updatedTrace.logFilePath,
		},
		artifact: updatedArtifact
			? {
					id: updatedArtifact.id,
					path: artifactPath,
					title: updatedArtifact.title,
				}
			: undefined,
		approvals: updatedItems,
		summary: {
			...summarizeApprovals(updatedItems),
			workflowState: updatedTrace.status,
			workItemState: updatedWorkItem.status,
			approvalState: updatedApproval.status,
			nextAction:
				action === "approve"
					? "Approval recorded. The queued build workflow resumed, wrote a continuation artifact, and completed successfully."
					: "Approval denied. The blocked build trace and work item were cancelled and will not continue.",
		},
	};
}
