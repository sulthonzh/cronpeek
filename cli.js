#!/usr/bin/env node
'use strict';
const { readCrontab, parseCrontab, formatText, formatJSON, formatMarkdown, parseArgs, HELP } = require('./src/index');

const args = parseArgs(process.argv);
if (args.help) { console.log(HELP); process.exit(0); }

const lines = readCrontab(args.user);
const jobs = parseCrontab(lines);
const now = new Date();

switch (args.format) {
  case 'json': console.log(formatJSON(jobs, now)); break;
  case 'markdown': console.log(formatMarkdown(jobs, now)); break;
  default: console.log(formatText(jobs, now));
}
