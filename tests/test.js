'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseCronLine, parseCrontab, getNextRun, formatText, formatJSON, formatMarkdown, parseArgs, HELP, formatRelativeTime, parseField } = require('../src/index');

// Helper: create date from local components
function localDate(h, m) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

describe('parseField', () => {
  it('handles wildcard', () => assert.equal(parseField('*', 0, 59), null));
  it('handles single value', () => assert.deepEqual(parseField('5', 0, 59), [5]));
  it('handles range', () => assert.deepEqual(parseField('1-5', 0, 59), [1, 2, 3, 4, 5]));
  it('handles step', () => assert.deepEqual(parseField('*/15', 0, 59), [0, 15, 30, 45]));
  it('handles comma list', () => assert.deepEqual(parseField('1,3,5', 0, 59), [1, 3, 5]));
});

describe('parseCronLine', () => {
  it('parses standard 5-field', () => {
    const job = parseCronLine('0 2 * * * /usr/bin/backup');
    assert.equal(job.command, '/usr/bin/backup');
    assert.deepEqual(job.minute, [0]);
    assert.deepEqual(job.hour, [2]);
  });
  it('parses @daily', () => {
    const job = parseCronLine('@daily /usr/bin/cleanup');
    assert.equal(job.command, '/usr/bin/cleanup');
    assert.deepEqual(job.minute, [0]);
  });
  it('parses @hourly', () => {
    const job = parseCronLine('@hourly /usr/bin/check');
    assert.deepEqual(job.minute, [0]);
    assert.equal(job.hour, null);
  });
  it('returns null for comments', () => assert.equal(parseCronLine('# comment'), null));
  it('returns null for empty', () => assert.equal(parseCronLine(''), null));
  it('returns null for too few fields', () => assert.equal(parseCronLine('0 2 * *'), null));
  it('parses complex schedule', () => {
    const job = parseCronLine('30 4 * * 1-5 /usr/bin/work');
    assert.deepEqual(job.dayOfWeek, [1, 2, 3, 4, 5]);
  });
});

describe('parseCrontab', () => {
  it('skips comments and blanks', () => {
    assert.equal(parseCrontab(['# header', '', '0 * * * * run.sh', '']).length, 1);
  });
  it('returns empty for all comments', () => {
    assert.equal(parseCrontab(['# only comments']).length, 0);
  });
});

describe('getNextRun', () => {
  it('finds next for hourly job', () => {
    const job = parseCronLine('0 * * * * /bin/echo hi');
    // Use local time: 10:30 -> next should be 11:00
    const now = localDate(10, 30);
    const next = getNextRun(job, now);
    assert.ok(next);
    assert.equal(next.getHours(), 11);
    assert.equal(next.getMinutes(), 0);
  });
  it('finds next for daily job', () => {
    const job = parseCronLine('0 2 * * * /bin/backup');
    // 1:00 AM local -> next at 2:00 AM same day
    const now = localDate(1, 0);
    const next = getNextRun(job, now);
    assert.ok(next);
    assert.equal(next.getHours(), 2);
  });
  it('wraps to next day', () => {
    const job = parseCronLine('0 2 * * * /bin/backup');
    // 10:00 AM -> next is tomorrow 2:00 AM
    const now = localDate(10, 0);
    const next = getNextRun(job, now);
    assert.ok(next);
    assert.equal(next.getHours(), 2);
    assert.ok(next.getDate() > now.getDate() || next.getMonth() > now.getMonth());
  });
});

describe('formatRelativeTime', () => {
  it('shows minutes', () => assert.equal(formatRelativeTime(5 * 60000), 'in 5m'));
  it('shows hours and minutes', () => assert.equal(formatRelativeTime(90 * 60000), 'in 1h 30m'));
  it('shows days and hours', () => assert.equal(formatRelativeTime(26 * 60 * 60000), 'in 1d 2h'));
});

describe('formatText', () => {
  it('shows no entries', () => assert.ok(formatText([], new Date()).includes('No crontab')));
  it('shows job with command', () => {
    const job = parseCronLine('0 * * * * /bin/echo hi');
    assert.ok(formatText([job], new Date()).includes('/bin/echo hi'));
  });
});

describe('formatJSON', () => {
  it('produces valid JSON with fields', () => {
    const job = parseCronLine('0 * * * * /bin/echo hi');
    const parsed = JSON.parse(formatJSON([job], new Date()));
    assert.equal(parsed.length, 1);
    assert.ok(parsed[0].nextRun);
    assert.equal(parsed[0].command, '/bin/echo hi');
  });
});

describe('formatMarkdown', () => {
  it('shows no entries message', () => assert.ok(formatMarkdown([], new Date()).includes('No crontab')));
  it('produces table rows', () => {
    const job = parseCronLine('0 * * * * /bin/echo hi');
    const out = formatMarkdown([job], new Date());
    assert.ok(out.includes('|'));
    assert.ok(out.includes('/bin/echo hi'));
  });
});

describe('parseArgs', () => {
  it('defaults to text', () => assert.equal(parseArgs(['node', 'x']).format, 'text'));
  it('parses --json', () => assert.equal(parseArgs(['node', 'x', '--json']).format, 'json'));
  it('parses --markdown', () => assert.equal(parseArgs(['node', 'x', '--markdown']).format, 'markdown'));
  it('parses --user', () => assert.equal(parseArgs(['node', 'x', '--user', 'root']).user, 'root'));
  it('parses --help', () => assert.equal(parseArgs(['node', 'x', '--help']).help, true));
});

describe('HELP', () => {
  it('includes usage', () => assert.ok(HELP.includes('cronpeek') && HELP.includes('--json')));
});
