import { prisma } from '../apps/api/src/lib/prisma.js';
import { EvalRunService } from '../apps/api/src/modules/eval-runs/evalRunService.js';

// ANSI Color Codes for zero-dependency terminal styling
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

interface StepDiff {
  step: number;
  expectedTool: string;
  actualTool: string;
  match: boolean;
  gateStatus?: string;
  violations?: string[];
}

async function runCliRegressionHarness() {
  const targetContractId = process.env.CONTRACT_ID || 'contract_fintech_refund_v1';

  const evalService = new EvalRunService(prisma);

  // 1. Fetch Contract & Test Cases
  const contract = await prisma.taskContract.findFirst({
    where: { id: targetContractId },
    include: { evalCases: true },
  });

  if (!contract) {
    console.error(`${C.red}✖ TaskContract [${targetContractId}] not found in database.${C.reset}`);
    process.exit(1);
  }

  const orgId = process.env.ORG_ID || contract.organizationId || 'org_test_adversarial_suite';

  console.log(`\n${C.bold}${C.cyan}================================================================================${C.reset}`);
  console.log(`${C.bold} 🛡️  AGENTREADY CONTINUOUS EVALUATION & TRAJECTORY REGRESSION HARNESS${C.reset}`);
  console.log(`${C.cyan}================================================================================${C.reset}`);
  console.log(`${C.dim}Target Contract : ${C.reset}${C.bold}${targetContractId}${C.reset}`);
  console.log(`${C.dim}Organization    : ${C.reset}${orgId}`);
  console.log(`${C.dim}Execution Mode  : ${C.reset}Headless Deterministic Pipeline\n`);

  const evalCases = contract.evalCases;
  if (evalCases.length === 0) {
    console.warn(`${C.yellow}⚠ No EvalCases found for contract. Run database seed first.${C.reset}`);
    process.exit(0);
  }

  console.log(`Loaded ${C.bold}${evalCases.length}${C.reset} evaluation scenario(s). Executing test suite...\n`);

  let totalPassed = 0;
  let totalFailed = 0;
  const criticalViolations: { caseName: string; reason: string }[] = [];

  // 2. Execute Each EvalCase
  for (const [index, testCase] of evalCases.entries()) {
    const caseNum = `[${index + 1}/${evalCases.length}]`;
    const run = await evalService.runCase(orgId, testCase.id);

    const isPass = run.status === 'PASSED';
    if (isPass) totalPassed++;
    else totalFailed++;

    const statusBadge = isPass
      ? `${C.bgGreen}${C.bold} PASS ${C.reset}`
      : `${C.bgRed}${C.bold} FAIL ${C.reset}`;

    const scoreDisplay = `Score: ${(run.score * 100).toFixed(0)}% (Trajectory: ${((run.trajectoryScore ?? 1) * 100).toFixed(0)}%)`;

    console.log(`${caseNum} ${statusBadge} ${C.bold}${testCase.name}${C.reset} — ${C.dim}${scoreDisplay}${C.reset}`);

    // Fetch execution trace records to build the trajectory diff
    const traces = run.executionId
      ? await prisma.toolCallTrace.findMany({
          where: { executionId: run.executionId },
          orderBy: { startedAt: 'asc' },
        })
      : [];

    const expectedTools = (testCase.expectedTools as string[]) || [];
    const policy = (contract.trajectoryPolicy as any) || {};
    const expectedSteps = policy.expectedSteps || expectedTools.map((t: string) => ({ tool: t }));

    // Print Trajectory Diff if failed or if violations were recorded
    const violations = (run.violations as string[]) || [];
    if (!isPass || violations.length > 0) {
      console.log(`   ${C.magenta}Trajectory Graph & Policy Check:${C.reset}`);

      const maxSteps = Math.max(expectedSteps.length, traces.length);
      for (let s = 0; s < maxSteps; s++) {
        const exp = expectedSteps[s]?.tool || `${C.dim}(none)${C.reset}`;
        const act = traces[s]?.toolName || `${C.dim}(none)${C.reset}`;
        const match = exp === act;
        const icon = match ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
        const gate = traces[s]?.status || traces[s]?.approvalRequestId ? `[REQUIRE_APPROVAL]` : '';

        console.log(`     Step ${s + 1}: ${icon} Expected: ${exp.padEnd(26)} | Actual: ${act.padEnd(26)} ${C.yellow}${gate}${C.reset}`);
      }

      if (violations.length > 0) {
        console.log(`   ${C.red}Policy Violations:${C.reset}`);
        for (const v of violations) {
          console.log(`     - ${C.red}${v}${C.reset}`);
          criticalViolations.push({ caseName: testCase.name, reason: v });
        }
      }
      console.log('');
    }
  }

  // 3. Regression Delta Summary
  console.log(`${C.cyan}────────────────────────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`${C.bold}EVALUATION SUITE SUMMARY${C.reset}`);
  console.log(`${C.cyan}────────────────────────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`Total Cases Evaluated : ${evalCases.length}`);
  console.log(`Passed                : ${C.green}${totalPassed}${C.reset}`);
  console.log(`Failed                : ${totalFailed > 0 ? C.red : C.reset}${totalFailed}${C.reset}`);
  console.log(`Pass Rate             : ${totalPassed === evalCases.length ? C.green : C.yellow}${((totalPassed / evalCases.length) * 100).toFixed(1)}%${C.reset}\n`);

  // 4. CI/CD Gate Verdict
  if (totalFailed > 0 || criticalViolations.length > 0) {
    console.error(`${C.bgRed}${C.bold} 🚨 DEPLOYMENT BLOCKED: REGRESSION / POLICY VIOLATION DETECTED ${C.reset}\n`);
    console.error(`${C.red}The following security and trajectory boundaries were tripped:${C.reset}`);
    for (const item of criticalViolations) {
      console.error(`  ${C.bold}• [${item.caseName}]${C.reset}: ${item.reason}`);
    }
    console.log(`\nExit Code: 1\n`);
    process.exit(1);
  } else {
    console.log(`${C.bgGreen}${C.bold} ✅ ALL TRAJECTORY & POLICY CHECKS PASSED ${C.reset}`);
    console.log(`${C.green}No behavioral regressions detected. Agent is compliant with TaskContract.${C.reset}\n`);
    console.log(`Exit Code: 0\n`);
    process.exit(0);
  }
}

runCliRegressionHarness()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((err) => {
    console.error(`${C.red}Fatal harness error:${C.reset}`, err);
    process.exit(1);
  });
