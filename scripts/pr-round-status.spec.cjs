const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const script = process.env.PR_ROUND_STATUS_SCRIPT || path.resolve(__dirname, 'pr-round-status.sh');

// Runs the real script against a fake `gh` (canned `gh pr checks` output per poll; the last
// snapshot repeats; `gh pr view --json comments` returns `opts.comments` when set) and a fake
// `curl` (SonarCloud: no open issues). `jq` is the real one.
function run(snapshots, env = {}, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-round-status-'));
  snapshots.forEach((rows, index) => {
    fs.writeFileSync(
      path.join(dir, `poll-${index + 1}.txt`),
      rows.map((row) => row.join('\t')).join('\n') + '\n',
    );
  });
  fs.writeFileSync(path.join(dir, 'count'), '0');
  fs.writeFileSync(
    path.join(dir, 'comments.json'),
    JSON.stringify({
      comments: (opts.comments || []).map((c) => ({
        createdAt: c.createdAt,
        url: c.url || 'https://example.test/comment',
        author: { login: c.author || 'someone' },
        body: c.body,
      })),
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'gh'),
    `#!/usr/bin/env bash
if [ "$1" = "pr" ] && [ "$2" = "checks" ]; then
  n=$(($(cat "${dir}/count") + 1)); echo "$n" > "${dir}/count"
  f="${dir}/poll-$n.txt"; [ -f "$f" ] || f="${dir}/poll-${snapshots.length}.txt"
  cat "$f"; exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  cat "${dir}/comments.json"; exit 0
fi
if [ "$1" = "api" ]; then
  echo '[]'; exit 0
fi
exit 0
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(dir, 'curl'), `#!/usr/bin/env bash\necho '{"issues":[]}'\n`, {
    mode: 0o755,
  });

  const result = spawnSync('bash', [script, '491', ...(opts.extraArgs || [])], {
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      POLL_INTERVAL: '0',
      STABLE_POLLS: '3',
      ...env,
    },
    encoding: 'utf8',
    timeout: 20000,
  });
  const polls = Number(fs.readFileSync(path.join(dir, 'count'), 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return { ...result, polls };
}

const row = (name, bucket) => [name, bucket, '10s', `https://example.test/${name}`];
const GATE = 'All Checks Passed';

test('does not finish while jobs gated by needs: (Sonar, the aggregate gate) have not been created yet', () => {
  const early = [row('ESLint', 'pass'), row('Backend Unit Tests', 'pass')];
  const complete = [...early, row('SonarCloud Analysis', 'pass'), row(GATE, 'pass')];

  const result = run([early, early, complete]);

  assert.equal(result.status, 0);
  assert.ok(
    result.polls >= 3,
    `expected to keep polling past the early snapshot, polled ${result.polls}x`,
  );
  assert.match(result.stdout, /All 4 CI checks passed/);
});

test('reports a failing aggregate gate as a CI failure', () => {
  const result = run([
    [row('ESLint', 'pass'), row('SonarCloud Analysis', 'fail'), row(GATE, 'fail')],
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /2 of 3 CI checks failed/);
  assert.match(result.stdout, /SonarCloud Analysis/);
});

test('keeps waiting while any row is still pending, then finishes at the gate', () => {
  const running = [row('ESLint', 'pass'), row('Backend Unit Tests', 'pending')];
  const done = [row('ESLint', 'pass'), row('Backend Unit Tests', 'pass'), row(GATE, 'pass')];

  const result = run([running, running, done]);

  assert.equal(result.status, 0);
  assert.ok(result.polls >= 3);
  assert.match(result.stdout, /All 3 CI checks passed/);
});

test('falls back to a stable check list, with a warning, when the gate row never appears', () => {
  const rows = [row('ESLint', 'pass'), row('Prettier', 'pass')];

  const result = run([rows]);

  assert.equal(result.status, 0);
  assert.ok(result.polls >= 4, `needs STABLE_POLLS unchanged polls, polled ${result.polls}x`);
  assert.match(result.stderr, /No 'All Checks Passed' row appeared/);
  assert.match(result.stdout, /All 2 CI checks passed/);
});

test('detects a Codex review comment even when its preamble wording drifts — PR #510 regression, 2026-09-24', () => {
  const done = [row('ESLint', 'pass'), row(GATE, 'pass')];
  const since = '2026-01-01T00:00:00Z';
  // Round 1 on PR #510 dropped the leading emoji and used a plain hyphen instead of the em
  // dash the skill's own template uses ("🤖 ... via /pr-review — Codex") — the old regex
  // (`Automated review via \`?/pr-review\`? — Codex`, connector hardcoded to the em dash)
  // never matched this and hung the script forever.
  const result = run(
    [done],
    {},
    {
      extraArgs: ['--wait-codex', '--since', since],
      comments: [
        {
          createdAt: '2026-01-01T00:05:00Z',
          url: 'https://example.test/codex-comment',
          body: '> Automated review via /pr-review - Codex, 4-agent review.\n\n## PR Review',
        },
      ],
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Codex review: https:\/\/example\.test\/codex-comment/);
});
