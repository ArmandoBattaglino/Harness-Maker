$ErrorActionPreference = 'Stop'

$claudeRoot = Join-Path $HOME '.claude'
$codexRoot = Join-Path $HOME '.codex'
$skillsRoot = Join-Path $codexRoot 'skills'

function Normalize-Body([string]$content) {
  $body = [regex]::Replace($content, '(?s)^---\r?\n.*?\r?\n---\r?\n', '')
  $body = $body -replace [regex]::Escape('~/.claude/CLAUDE.md'), '~/.codex/AGENTS.md'
  $body = $body -replace [regex]::Escape('~/.claude/agents/'), '~/.codex/skills/'
  $body = $body -replace [regex]::Escape('~/.claude/commands/'), '~/.codex/skills/'
  return $body.Trim() + "`r`n"
}

function Read-Frontmatter([string]$path) {
  $content = Get-Content -Raw -LiteralPath $path
  $match = [regex]::Match($content, '(?s)^---\r?\n(.*?)\r?\n---\r?\n')
  $name = $null
  $description = $null
  if ($match.Success) {
    foreach ($line in ($match.Groups[1].Value -split "`r?`n")) {
      if ($line -match '^name:\s*(.+)$') { $name = $matches[1].Trim() }
      if ($line -match '^description:\s*(.+)$') { $description = $matches[1].Trim() }
    }
  }
  return [pscustomobject]@{
    Content = $content
    Body = Normalize-Body $content
    Name = $name
    Description = $description
  }
}

function Ensure-Dir([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    New-Item -ItemType Directory -Path $path | Out-Null
  }
}

function Write-Utf8([string]$path, [string]$content) {
  $dir = Split-Path -Parent $path
  Ensure-Dir $dir
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

function To-AsciiSafe([string]$content) {
  $content = $content.Replace([string][char]0x2013, '-').Replace([string][char]0x2014, '-')
  $content = $content.Replace([string][char]0x2018, "'").Replace([string][char]0x2019, "'")
  $content = $content.Replace([string][char]0x201C, '"').Replace([string][char]0x201D, '"')
  $content = $content.Replace([string][char]0x2026, '...')
  $content = $content.Replace([string][char]0x2192, '->')
  $content = $content.Replace([string][char]0x2713, '[ok]')
  $content = $content.Replace([string][char]0x2714, '[ok]')
  $content = $content.Replace([string][char]0x2705, '[ok]')
  $content = $content.Replace([string][char]0x274C, '[fail]')
  $content = $content.Replace([string][char]0x26A0, '[warn]')
  $content = [regex]::Replace($content, '[^\u0009\u000A\u000D\u0020-\u007E]', '?')
  return $content
}

function Join-Lines([string[]]$lines) {
  return ($lines -join "`r`n")
}

function Yaml-Quote([string]$value) {
  if ($null -eq $value) { return '""' }
  $value = To-AsciiSafe $value
  $escaped = $value.Replace('\', '\\').Replace('"', '\"')
  return '"' + $escaped + '"'
}

function Make-Skill(
  [string]$folderName,
  [string]$displayName,
  [string]$shortDescription,
  [string]$triggerDescription,
  [string]$defaultPrompt,
  [string]$body,
  [hashtable]$referenceFiles
) {
  $skillDir = Join-Path $skillsRoot $folderName
  Ensure-Dir $skillDir
  Ensure-Dir (Join-Path $skillDir 'agents')
  if ($referenceFiles.Count -gt 0) {
    Ensure-Dir (Join-Path $skillDir 'references')
  }

  $skillMd = @"
---
name: $(Yaml-Quote $folderName)
description: $(Yaml-Quote $triggerDescription)
---

# $displayName

This skill is a faithful Codex migration of the corresponding global Claude Code capability.

## Codex Adaptation Notes

- Treat references to Claude slash commands as named workflows to follow inside Codex.
- Treat references to `Agent(...)` or sub-agent orchestration as Codex subagents, explicit skill use, or direct execution when that is the closest native equivalent.
- Treat references to `~/.claude/CLAUDE.md` as `~/.codex/AGENTS.md`.
- Preserve the workflow, output format, and memory discipline from the original Claude definition unless a Codex runtime constraint requires a direct equivalent instead of literal hook behavior.

## Migrated Definition

$body
"@
  Write-Utf8 (Join-Path $skillDir 'SKILL.md') (To-AsciiSafe $skillMd)

  $yaml = @"
interface:
  display_name: "$displayName"
  short_description: "$shortDescription"
  default_prompt: "$defaultPrompt"
"@
  Write-Utf8 (Join-Path $skillDir 'agents\openai.yaml') (To-AsciiSafe $yaml)

  foreach ($entry in $referenceFiles.GetEnumerator()) {
    $refPath = Join-Path $skillDir ('references\' + $entry.Key)
    Write-Utf8 $refPath $entry.Value
  }
}

function To-Title([string]$value) {
  return (($value -split '-') | ForEach-Object {
      if ($_.Length -gt 0) {
        $_.Substring(0, 1).ToUpper() + $_.Substring(1)
      }
    }) -join ' '
}

$globalClaude = Get-Content -Raw -LiteralPath (Join-Path $claudeRoot 'CLAUDE.md')
$settingsJson = Get-Content -Raw -LiteralPath (Join-Path $claudeRoot 'settings.json')
$settingsLocalPath = Join-Path $claudeRoot 'settings.local.json'
$settingsLocalJson = if (Test-Path -LiteralPath $settingsLocalPath) {
  Get-Content -Raw -LiteralPath $settingsLocalPath
} else {
  '{}'
}

$globalSkillBody = @"
Act as the global compatibility layer for a Claude Code -> Codex migrated setup.

## Scope

Use this skill when Codex needs to honor the user's migrated global Claude conventions, especially:
- the specialist roster from `~/.claude/agents/`
- the command workflows from `~/.claude/commands/`
- the project memory protocol
- the hook intent captured in the original Claude settings

## Global Workflow

$(Normalize-Body $globalClaude)

## Hook Parity Guidance

Translate the original hook behavior into Codex-native behavior as follows:
- Session start hook: proactively review recent project memory before substantial work.
- Pre-tool task-difficulty hook: if the active task is medium or hard, consider decomposition before deep implementation.
- Post write/edit WS hook: whenever websocket or contract files change, verify both emitter and consumer coverage.
- Post agent trio hook: after substantial tasks, keep plan, docs, and code map style artifacts synchronized.
- Memory freshness hook: keep `docs/memory/ACTIVITY_LOG.md` and agent memory updated before finishing a task.
- Auto-commit hook intent: preserve the workflow expectation, but prefer explicit Codex git actions instead of hidden automatic commits.

Read the files in `references/` when exact original wording or settings are needed.
"@

Make-Skill -folderName 'claude-global-core' `
  -displayName 'Claude Global Core' `
  -shortDescription 'Global Claude policy migrated to Codex' `
  -triggerDescription "Faithful Codex migration of the user's global Claude Code setup. Use when Codex should follow the migrated global workflow, memory protocol, agent roster, command conventions, and hook intent originally defined in ~/.claude." `
  -defaultPrompt 'Use $claude-global-core to follow the migrated global Claude Code workflow and memory rules in this session.' `
  -body $globalSkillBody `
  -referenceFiles @{
    'original-claude-global.md' = $globalClaude
    'original-settings.json' = $settingsJson
    'original-settings.local.json' = $settingsLocalJson
  }

$agentFiles = Get-ChildItem -LiteralPath (Join-Path $claudeRoot 'agents') -Filter '*.md' | Sort-Object Name
foreach ($file in $agentFiles) {
  $parsed = Read-Frontmatter $file.FullName
  $agentName = if ($parsed.Name) { $parsed.Name } else { [System.IO.Path]::GetFileNameWithoutExtension($file.Name) }
  $skillName = "claude-$agentName"
  $displayName = 'Claude ' + (To-Title $agentName)
  $shortDescription = if ($parsed.Description) {
    $parsed.Description.Substring(0, [Math]::Min(60, $parsed.Description.Length))
  } else {
    "Migrated Claude agent: $agentName"
  }
  $trigger = if ($parsed.Description) {
    "Faithful Codex migration of Claude Code's '$agentName' global agent. Use when Codex should perform this specialist role: $($parsed.Description)"
  } else {
    "Faithful Codex migration of Claude Code's '$agentName' global agent."
  }
  $defaultPrompt = 'Use $' + $skillName + " to act as the migrated Claude '$agentName' specialist for this task."
  $body = @"
Act as the migrated Claude Code specialist $agentName.

Original Claude description: $($parsed.Description)

$($parsed.Body)
"@
  Make-Skill -folderName $skillName `
    -displayName $displayName `
    -shortDescription $shortDescription `
    -triggerDescription $trigger `
    -defaultPrompt $defaultPrompt `
    -body $body `
    -referenceFiles @{
      'original-agent.md' = $parsed.Content
    }
}

$commandFiles = Get-ChildItem -LiteralPath (Join-Path $claudeRoot 'commands') -Filter '*.md' | Sort-Object Name
foreach ($file in $commandFiles) {
  $commandName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
  $content = Get-Content -Raw -LiteralPath $file.FullName
  $body = Normalize-Body $content
  $skillName = "claude-cmd-$commandName"
  $displayName = 'Claude Command ' + (To-Title $commandName)
  $firstLine = (($body -split "`r?`n") | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1)
  if (-not $firstLine) {
    $firstLine = "Migrated Claude command /$commandName"
  }
  $shortDescription = $firstLine.Substring(0, [Math]::Min(60, $firstLine.Length))
  $trigger = "Faithful Codex migration of Claude Code's '/$commandName' command. Use when Codex should execute the same workflow or command-style procedure inside Codex instead of Claude slash commands."
  $defaultPrompt = 'Use $' + $skillName + " to execute the migrated Claude '/$commandName' workflow in Codex."
  $wrappedBody = @"
Act as the Codex equivalent of Claude Code's `/$commandName` command.

$body
"@
  Make-Skill -folderName $skillName `
    -displayName $displayName `
    -shortDescription $shortDescription `
    -triggerDescription $trigger `
    -defaultPrompt $defaultPrompt `
    -body $wrappedBody `
    -referenceFiles @{
      'original-command.md' = $content
    }
}

$agentSkillLines = @()
foreach ($file in $agentFiles) {
  $agentSkillLines += '- `$claude-' + [System.IO.Path]::GetFileNameWithoutExtension($file.Name) + '`'
}
$commandSkillLines = @()
foreach ($file in $commandFiles) {
  $commandSkillLines += '- `$claude-cmd-' + [System.IO.Path]::GetFileNameWithoutExtension($file.Name) + '`'
}

$agentsMdLines = @(
  '# Global Codex Configuration',
  '',
  "This file is a faithful structural migration of the user's global Claude Code setup from `~/.claude` into Codex-native global files under `~/.codex`.",
  '',
  '## Global Core',
  '',
  '- Use `$claude-global-core` whenever the migrated Claude global workflow, hook intent, or project-memory protocol matters.',
  '- Treat this file as the Codex equivalent of the original `~/.claude/CLAUDE.md`.',
  '- Treat `~/.codex/skills/claude-*` as the migrated specialist roster.',
  '- Treat `~/.codex/skills/claude-cmd-*` as the migrated command library.',
  '',
  '## Mandatory Workflow',
  '',
  '- At session start, review project memory before substantial work when `docs/memory/` exists.',
  '- On bugs or unexpected behavior, route through the migrated debugger flow.',
  '- After substantial tasks, keep plan, docs, and code-map style artifacts synchronized.',
  '- Preserve the original test-gate and websocket-contract discipline from the Claude setup.',
  '- Preserve the original memory protocol: read relevant memory before work, write updates before finishing.',
  '',
  '## Hook Intent Parity',
  '',
  'Codex does not expose the same Claude hook mechanism, so follow the original hook intent behaviorally:',
  '- Session start: proactively load recent memory context.',
  '- Before deep work on medium/hard tasks: consider decomposition.',
  '- After websocket-related edits: verify producer/consumer schema parity.',
  '- After implementation waves: refresh documentation, planning, and validation artifacts.',
  '- Keep memory files current before ending a task.',
  '- Prefer explicit git actions to hidden auto-commit behavior.',
  '',
  '## Migrated Agent Skills',
  '',
  (Join-Lines $agentSkillLines),
  '',
  '## Migrated Command Skills',
  '',
  (Join-Lines $commandSkillLines),
  '',
  '## Source of Truth',
  '',
  'The original source material is preserved under the relevant skill `references/` directories, especially:',
  '- `~/.codex/skills/claude-global-core/references/original-claude-global.md`',
  '- `~/.codex/skills/claude-global-core/references/original-settings.json`',
  '- `~/.codex/skills/claude-global-core/references/original-settings.local.json`'
)
$agentsMd = Join-Lines $agentsMdLines
Write-Utf8 (Join-Path $codexRoot 'AGENTS.md') (To-AsciiSafe $agentsMd)

$migrationDir = Join-Path $codexRoot 'claude-migration'
Ensure-Dir $migrationDir
$summary = @{
  migrated_at = (Get-Date).ToString('s')
  source = $claudeRoot
  target = $codexRoot
  global_skill = 'claude-global-core'
  agent_skill_count = $agentFiles.Count
  command_skill_count = $commandFiles.Count
}
Write-Utf8 (Join-Path $migrationDir 'summary.json') ($summary | ConvertTo-Json)

Write-Output ('AGENTS_MD=' + (Join-Path $codexRoot 'AGENTS.md'))
Write-Output ('GLOBAL_SKILL=' + (Join-Path $skillsRoot 'claude-global-core'))
Write-Output ('AGENT_SKILLS=' + $agentFiles.Count)
Write-Output ('COMMAND_SKILLS=' + $commandFiles.Count)
