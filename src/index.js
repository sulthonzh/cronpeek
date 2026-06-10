'use strict';

const { execSync } = require('child_process');

// ── cron field parsing ──

const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const DAY_NAMES = ['sun','mon','tue','wed','thu','fri','sat'];

function normalizeField(field, names) {
  if (!names) return field.toLowerCase();
  let s = field.toLowerCase();
  for (let i = 0; i < names.length; i++) {
    s = s.replace(names[i], String(i + (names === MONTH_NAMES ? 1 : 0)));
  }
  return s;
}

function parseField(raw, min, max, names) {
  const field = normalizeField(raw, names);
  if (field === '*') return null; // all values
  const values = new Set();
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      const [start, end] = range === '*' ? [min, max] : range.split('-').map(Number);
      for (let i = start; i <= (end === undefined ? start : end); i += step) values.add(i);
    } else if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      for (let i = start; i <= end; i++) values.add(i);
    } else {
      values.add(parseInt(part, 10));
    }
  }
  return [...values].sort((a, b) => a - b);
}

function parseCronLine(line) {
  // Handle special strings
  const specials = {
    '@yearly':   '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly':  '0 0 1 * *',
    '@weekly':   '0 0 * * 0',
    '@daily':    '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly':   '0 * * * *',
  };
  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();
  let expr, command;
  if (lower.startsWith('@')) {
    const parts = trimmed.split(/\s+/);
    const alias = parts[0].toLowerCase();
    if (!specials[alias]) return null;
    expr = specials[alias];
    command = parts.slice(1).join(' ');
  } else {
    const parts = trimmed.split(/\s+/);
    if (parts.length < 6) return null;
    expr = parts.slice(0, 5).join(' ');
    command = parts.slice(5).join(' ');
  }
  if (!command) return null;

  const fields = expr.split(/\s+/);
  return {
    minute:     parseField(fields[0], 0, 59),
    hour:       parseField(fields[1], 0, 23),
    dayOfMonth: parseField(fields[2], 1, 31, MONTH_NAMES),
    month:      parseField(fields[3], 1, 12, MONTH_NAMES),
    dayOfWeek:  parseField(fields[4], 0, 6, DAY_NAMES),
    raw:        expr,
    command,
  };
}

function matchesField(values, current) {
  if (values === null) return true; // wildcard
  return values.includes(current);
}

function getNextRun(job, from) {
  const start = new Date(from);
  start.setSeconds(0, 0);
  // Search forward minute by minute, up to 366 days
  const limit = new Date(from);
  limit.setDate(limit.getDate() + 366);
  let d = new Date(start);
  // Optimize: jump to next matching minute/hour
  for (let iter = 0; iter < 525960; iter++) { // 366*24*60
    if (matchesField(job.month, d.getMonth() + 1) &&
        matchesField(job.dayOfMonth, d.getDate()) &&
        matchesField(job.dayOfWeek, d.getDay()) &&
        matchesField(job.hour, d.getHours()) &&
        matchesField(job.minute, d.getMinutes())) {
      return d;
    }
    d = new Date(d.getTime() + 60000);
    if (d > limit) return null;
  }
  return null;
}

// ── read crontab ──

function readCrontab(user) {
  try {
    const cmd = user ? `crontab -u ${user} -l 2>/dev/null` : 'crontab -l 2>/dev/null';
    const output = execSync(cmd, { encoding: 'utf-8' });
    return output.split('\n');
  } catch {
    return [];
  }
}

function parseCrontab(lines) {
  const jobs = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const job = parseCronLine(trimmed);
    if (job) jobs.push(job);
  }
  return jobs;
}

// ── formatting ──

function formatRelativeTime(ms) {
  if (ms < 0) return 'now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hours < 24) return `in ${hours}h ${remainMins}m`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return `in ${days}d ${remainHours}h`;
}

function formatTime(date) {
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function fieldDisplay(values, names) {
  if (values === null) return '*';
  if (names) return values.map(v => names[v] || v).join(',');
  return values.join(',');
}

function humanSchedule(job) {
  const min = fieldDisplay(job.minute);
  const hour = fieldDisplay(job.hour);
  const dom = fieldDisplay(job.dayOfMonth);
  const mon = fieldDisplay(job.month, MONTH_NAMES);
  const dow = fieldDisplay(job.dayOfWeek, DAY_NAMES);
  return `${min} ${hour} ${dom} ${mon} ${dow}`;
}

function formatText(jobs, now) {
  if (!jobs.length) return 'No crontab entries found.';
  const lines = [];
  for (const job of jobs) {
    const next = getNextRun(job, now);
    const nextStr = next ? `${formatTime(next)} (${formatRelativeTime(next - now)})` : 'no upcoming run found';
    const cmd = job.command.length > 70 ? job.command.slice(0, 67) + '...' : job.command;
    lines.push(`⏰ ${humanSchedule(job)}`);
    lines.push(`   ${cmd}`);
    lines.push(`   Next: ${nextStr}`);
    lines.push('');
  }
  return lines.join('\n');
}

function formatJSON(jobs, now) {
  return JSON.stringify(jobs.map(job => {
    const next = getNextRun(job, now);
    return {
      schedule: humanSchedule(job),
      raw: job.raw,
      command: job.command,
      nextRun: next ? next.toISOString() : null,
      nextRunRelative: next ? formatRelativeTime(next - now) : null,
    };
  }), null, 2);
}

function formatMarkdown(jobs, now) {
  if (!jobs.length) return '_No crontab entries found._\n';
  const lines = ['| Schedule | Command | Next Run |', '|----------|---------|----------|'];
  for (const job of jobs) {
    const next = getNextRun(job, now);
    const nextStr = next ? `${formatTime(next)} (${formatRelativeTime(next - now)})` : '—';
    const cmd = job.command.replace(/\|/g, '\\|');
    lines.push(`| \`${job.raw}\` | ${cmd} | ${nextStr} |`);
  }
  return lines.join('\n') + '\n';
}

// ── CLI arg parsing ──

function parseArgs(argv) {
  const args = { format: 'text', user: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.format = 'json';
    else if (a === '--markdown' || a === '--md') args.format = 'markdown';
    else if (a === '--user' && argv[i + 1]) args.user = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const HELP = `
cronpeek — view your crontabs and see when they'll next fire

Usage:
  cronpeek              show all crontab entries with next run time
  cronpeek --json       output as JSON
  cronpeek --markdown   output as markdown table
  cronpeek --user root  show crontab for another user

Options:
  --json          JSON output
  --markdown      Markdown table output
  --user <name>   Show crontab for specific user
  --help, -h      Show this help
`.trim();

module.exports = { parseCronLine, parseCrontab, getNextRun, formatText, formatJSON, formatMarkdown, parseArgs, HELP, humanSchedule, formatRelativeTime, readCrontab, matchesField, parseField };
