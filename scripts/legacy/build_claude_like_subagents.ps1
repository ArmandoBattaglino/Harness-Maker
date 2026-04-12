$ErrorActionPreference = 'Stop'

$claudeRoot = Join-Path $HOME '.claude'
$codexRoot = Join-Path $HOME '.codex'
$agentsOut = Join-Path $codexRoot 'subagents\agents'

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

function Strip-Frontmatter([string]$content) {
  return [regex]::Replace($content, '(?s)^---\r?\n.*?\r?\n---\r?\n', '').Trim()
}

function Profile-ForAgent([string]$name) {
  switch ($name) {
    'architect' { return 'architect' }
    'backend-dev' { return 'builder' }
    'frontend-dev' { return 'builder' }
    'debugger' { return 'debugger' }
    'security' { return 'security' }
    'qa-tester' { return 'review' }
    'researcher' { return 'review' }
    'documenter' { return 'review' }
    'code-mapper' { return 'review' }
    'project-manager' { return 'planner' }
    'memory-keeper' { return 'planner' }
    'prd-writer' { return 'planner' }
    'creative-director' { return 'planner' }
    'tech-lead' { return 'architect' }
    'devops' { return 'builder' }
    'integration-validator' { return 'review' }
    'orchestrator' { return 'orchestrator' }
    default { return 'builder' }
  }
}

function Approval-ForProfile([string]$profile) {
  switch ($profile) {
    'security' { return 'on-request' }
    'builder' { return 'on-request' }
    'debugger' { return 'on-request' }
    'architect' { return 'on-request' }
    'planner' { return 'on-request' }
    'review' { return 'on-request' }
    'orchestrator' { return 'on-request' }
    default { return 'on-request' }
  }
}

function Sandbox-ForProfile([string]$profile) {
  switch ($profile) {
    'security' { return 'workspace-write' }
    'builder' { return 'workspace-write' }
    'debugger' { return 'workspace-write' }
    'architect' { return 'read-only' }
    'planner' { return 'read-only' }
    'review' { return 'read-only' }
    'orchestrator' { return 'workspace-write' }
    default { return 'workspace-write' }
  }
}

Ensure-Dir $agentsOut

$agentFiles = Get-ChildItem -LiteralPath (Join-Path $claudeRoot 'agents') -Filter '*.md'
foreach ($file in $agentFiles) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
  $body = Strip-Frontmatter (Get-Content -Raw -LiteralPath $file.FullName)
  $profile = Profile-ForAgent $name
  $approval = Approval-ForProfile $profile
  $sandbox = Sandbox-ForProfile $profile
  $out = @"
---
profile: $profile
approval_policy: $approval
sandbox_mode: $sandbox
---

$body
"@
  Write-Utf8 (Join-Path $agentsOut ($name + '.md')) (To-AsciiSafe $out)
}

$orchestratePath = Join-Path $claudeRoot 'commands\orchestrate.md'
if (Test-Path -LiteralPath $orchestratePath) {
  $orchestratorBody = Strip-Frontmatter (Get-Content -Raw -LiteralPath $orchestratePath)
  $orchestratorOut = @"
---
profile: orchestrator
approval_policy: on-request
sandbox_mode: workspace-write
---

Act as the main Claude-like orchestrator for Codex. Prefer delegating specialist work through the subagents MCP registry when a specialist matches the task.

$orchestratorBody
"@
  Write-Utf8 (Join-Path $agentsOut 'orchestrator.md') (To-AsciiSafe $orchestratorOut)
}

Write-Output ('AGENTS_DIR=' + $agentsOut)
Write-Output ('AGENT_COUNT=' + ((Get-ChildItem -LiteralPath $agentsOut -Filter '*.md').Count))
