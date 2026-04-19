import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalDaemon } from "@opengtm/daemon";
import { getRecord, readArtifactBlob } from "@opengtm/storage";
import { describe, expect, it } from "vitest";
import { handleApprovals } from "../src/handlers/approvals.js";
import { handleBuildRun } from "../src/handlers/build.js";
import { parseCliArgs } from "../src/parse.js";
import { renderCliOutput } from "../src/render/index.js";

describe("cli approvals handler", () => {
	it("returns operator summary data for approval list output", async () => {
		const daemon = createLocalDaemon({
			rootDir: mkdtempSync(join(tmpdir(), "opengtm-approvals-list-")),
		});

		await handleBuildRun({
			daemon,
			goal: "approve list build",
			workspaceId: "w1",
			initiativeId: "i1",
		});

		const result = await handleApprovals({ daemon });
		const output = renderCliOutput({
			parsed: parseCliArgs(["approvals"]),
			result,
		});

		expect(result.summary).toMatchObject({
			total: 1,
			pending: 1,
			approved: 0,
			denied: 0,
		});
		expect(output).toContain("Approval queue");
		expect(output).toContain("pending: 1");
		expect(output).toContain("approvals approve <id>");
	});

	it("approves a pending request and continues the linked build workflow to completion", async () => {
		const daemon = createLocalDaemon({
			rootDir: mkdtempSync(join(tmpdir(), "opengtm-approvals-approve-")),
		});
		const build = await handleBuildRun({
			daemon,
			goal: "resume build after approval",
			workspaceId: "w1",
			initiativeId: "i1",
		});

		if (!build.approvalRequestId) {
			throw new Error("Expected approval request id after build run");
		}

		const result = await handleApprovals({
			daemon,
			action: "approve",
			id: build.approvalRequestId,
		});

		expect(result.summary).toMatchObject({
			pending: 0,
			approved: 1,
			denied: 0,
			approvalState: "approved",
			workflowState: "completed",
			workItemState: "completed",
		});

		const approval = getRecord<import("@opengtm/types").OpenGtmApprovalRequest>(
			daemon.storage,
			"approval_requests",
			build.approvalRequestId,
		);
		const trace = getRecord<import("@opengtm/types").OpenGtmRunTrace>(
			daemon.storage,
			"run_traces",
			build.traceId,
		);
		const workItem = getRecord<import("@opengtm/types").OpenGtmWorkItem>(
			daemon.storage,
			"work_items",
			build.workItem.id,
		);
		const artifact = result.artifact?.id
			? getRecord<import("@opengtm/types").OpenGtmArtifactRecord>(
					daemon.storage,
					"artifacts",
					result.artifact.id,
				)
			: null;

		expect(approval).toBeTruthy();
		expect(trace).toBeTruthy();
		expect(workItem).toBeTruthy();
		expect(artifact).toBeTruthy();
		if (
			!approval ||
			!trace ||
			!workItem ||
			!artifact ||
			!result.artifact?.path
		) {
			throw new Error(
				"Expected linked approval records to exist after approve",
			);
		}
		expect(approval.status).toBe("approved");
		expect(trace.status).toBe("completed");
		expect(trace.steps).toEqual([
			{ name: "spec", status: "completed" },
			{ name: "implement", status: "completed" },
			{ name: "validate", status: "completed" },
			{ name: "handoff", status: "completed" },
		]);
		expect(trace.artifactIds).toContain(artifact.id);
		expect(trace.endedAt).toBeTypeOf("string");
		expect(workItem.status).toBe("completed");
		expect(artifact.traceRef).toBe(trace.id);
		expect(artifact.contentRef).toBe(result.artifact.path);
		expect(
			readArtifactBlob(result.artifact.path, { parseJson: true }),
		).toMatchObject({
			workItemId: build.workItem.id,
			approvalId: build.approvalRequestId,
			workflowState: "completed",
			completedPhases: ["spec", "implement", "validate", "handoff"],
		});
	});

	it("denies a pending request and cancels linked workflow state", async () => {
		const daemon = createLocalDaemon({
			rootDir: mkdtempSync(join(tmpdir(), "opengtm-approvals-deny-")),
		});
		const build = await handleBuildRun({
			daemon,
			goal: "stop build after denial",
			workspaceId: "w1",
			initiativeId: "i1",
		});

		if (!build.approvalRequestId) {
			throw new Error("Expected approval request id after build run");
		}

		const result = await handleApprovals({
			daemon,
			action: "deny",
			id: build.approvalRequestId,
		});

		expect(result.summary).toMatchObject({
			pending: 0,
			approved: 0,
			denied: 1,
			approvalState: "denied",
			workflowState: "cancelled",
			workItemState: "cancelled",
		});

		const approval = getRecord<import("@opengtm/types").OpenGtmApprovalRequest>(
			daemon.storage,
			"approval_requests",
			build.approvalRequestId,
		);
		const trace = getRecord<import("@opengtm/types").OpenGtmRunTrace>(
			daemon.storage,
			"run_traces",
			build.traceId,
		);
		const workItem = getRecord<import("@opengtm/types").OpenGtmWorkItem>(
			daemon.storage,
			"work_items",
			build.workItem.id,
		);

		expect(approval).toBeTruthy();
		expect(trace).toBeTruthy();
		expect(workItem).toBeTruthy();
		if (!approval || !trace || !workItem) {
			throw new Error("Expected linked approval records to exist after deny");
		}
		expect(approval.status).toBe("denied");
		expect(trace.status).toBe("cancelled");
		expect(trace.steps[1].status).toBe("cancelled");
		expect(trace.endedAt).toBeTypeOf("string");
		expect(workItem.status).toBe("cancelled");
	});

	it("fails for missing or unknown approval ids", async () => {
		const daemon = createLocalDaemon({
			rootDir: mkdtempSync(join(tmpdir(), "opengtm-approvals-errors-")),
		});

		await expect(
			handleApprovals({ daemon, action: "approve" }),
		).rejects.toThrow("Approval id is required for approvals approve.");
		await expect(
			handleApprovals({ daemon, action: "deny", id: "missing-id" }),
		).rejects.toThrow("Approval request not found: missing-id");
	});

	it("rejects transitions from non-pending approvals", async () => {
		const daemon = createLocalDaemon({
			rootDir: mkdtempSync(join(tmpdir(), "opengtm-approvals-transition-")),
		});
		const build = await handleBuildRun({
			daemon,
			goal: "single-use approval",
			workspaceId: "w1",
			initiativeId: "i1",
		});

		await handleApprovals({
			daemon,
			action: "approve",
			id: build.approvalRequestId,
		});

		await expect(
			handleApprovals({
				daemon,
				action: "deny",
				id: build.approvalRequestId,
			}),
		).rejects.toThrow(
			"Invalid OpenGTM approval transition from approved to denied",
		);
	});
});
