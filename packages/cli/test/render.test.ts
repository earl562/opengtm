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
		});

		expect(parseCliArgs(["--json", "connector", "list"])).toEqual({
			command: "connector",
			subcommand: "list",
			flags: { json: true },
			positional: [],
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
		expect(catalogOutput).toContain("reference-only");

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
		expect(workflowOutput).toContain("Review the analysis artifact and hand the trace to build");

		rmSync(rootDir, { recursive: true, force: true });
	});

	it("renders canonical eval dimensions and pass state", async () => {
		const result = await handleEvals({ suite: "canonical" });
		const output = renderCliOutput({
			parsed: parseCliArgs(["evals", "run", "canonical"]),
			result,
		});

		expect(output).toContain("suite: canonical");
		expect(output).toContain("pass: true");
		expect(output).toContain("canonical scenario: crm.roundtrip");
		expect(output).toContain("transferability:");
		expect(output).toContain("Ablation deltas");
	});
});
