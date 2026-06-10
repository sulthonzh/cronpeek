# cronpeek

View your crontabs and see when they'll next fire — no more guessing.

You know that feeling when you `crontab -l` and see `0 2 * * 1-5 /some/script.sh` and you're like... "ok so when does this actually run?" That's what cronpeek fixes.

## Install

```bash
npm install -g cronpeek
```

## Usage

```bash
# See all your crontab entries with next run time
cronpeek

# JSON output (pipe to jq, use in scripts)
cronpeek --json

# Markdown table (great for docs)
cronpeek --markdown

# Check another user's crontab
cronpeek --user root
```

## Example Output

```
⏰ 0 2 * * 1-5
   /usr/local/bin/backup.sh
   Next: Jun 11, 02:00 (in 15h 13m)

⏰ */15 * * * *
   /usr/local/bin/health-check.sh
   Next: Jun 10, 12:00 (in 13m)
```

## Why

`crontab -l` shows you the schedule syntax, not when things actually happen. cronpeek parses every entry and tells you exactly when it'll fire next — with a human-readable countdown.

## Features

- Parses all standard cron syntax: ranges (`1-5`), steps (`*/15`), lists (`0,30`), day/month names
- Supports `@daily`, `@hourly`, `@weekly`, `@monthly`, `@yearly` aliases
- Calculates next run time for each entry
- Text, JSON, and markdown output
- Zero dependencies

## License

MIT
