import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const outPath = path.join(process.cwd(), 'docs', 'HANDOFF.auto.md');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return (err.stdout || err.stderr || err.message || '').toString().trim();
  }
}

const timestamp = new Date().toISOString();
let output = `# AUTO SNAPSHOT — ${timestamp}\n\n`;

output += `## Git\n`;
output += `Branch: ${run('git rev-parse --abbrev-ref HEAD')}\n`;
output += `Recent commits:\n\`\`\`\n${run('git log --oneline -8')}\n\`\`\`\n\n`;

output += `### Uncommitted changes\n\`\`\`\n${run('git status --short')}\n\`\`\`\n\n`;

output += `## Task status\n`;
try {
  const tasks = fs.readFileSync(path.join(process.cwd(), 'docs', 'TASKS.md'), 'utf-8');
  const taskLines = tasks.split('\n').filter(l => l.startsWith('| T')).join('\n');
  output += taskLines + '\n\n';
} catch (e) {
  output += `(TASKS.md not found)\n\n`;
}

output += `## Env keys present (names only)\n`;
if (fs.existsSync(path.join(process.cwd(), '.env'))) {
  const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
  const keys = envContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => line.split('=')[0]);
  output += keys.map(k => ` - ${k}`).join('\n') + '\n\n';
} else {
  output += ` (no .env)\n\n`;
}

fs.writeFileSync(outPath, output, 'utf-8');
console.log(`wrote ${outPath}`);

