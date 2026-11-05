const fs = require('fs');
const content = fs.readFileSync('apps/api/test/mockPrisma.ts', 'utf-8');

if (content.includes('mockPrisma.task.findFirst')) {
  console.log('task.findFirst is already implemented.');
}

if (content.includes('mockPrisma.project.findFirst')) {
  console.log('project.findFirst is already implemented.');
}

if (content.includes('mockPrisma.agentIdentity.findFirst')) {
  console.log('agentIdentity.findFirst is already implemented.');
}

if (content.includes('mockPrisma.taskContract.findFirst')) {
  console.log('taskContract.findFirst is already implemented.');
}

if (content.includes('mockPrisma.agentExecution.findFirst')) {
  console.log('agentExecution.findFirst is already implemented.');
}
