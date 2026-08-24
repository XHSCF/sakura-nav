[CmdletBinding()]
param(
  [ValidateSet("Status", "Backup", "Migrate", "Restore")]
  [string]$Action = "Status",
  [string]$BackupFile = "",
  [switch]$Yes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ConfigPath = Join-Path $Root "wrangler.jsonc"
$MigrationDirectory = Join-Path $Root "migrations"
$BackupDirectory = Join-Path $Root ".d1-backups"
$WranglerVersion = "4.125.0"

function Resolve-WranglerCommand {
  $localWrangler = Join-Path $Root "node_modules\.bin\wrangler.cmd"
  if (Test-Path -LiteralPath $localWrangler) {
    return @{ File = $localWrangler; Prefix = @() }
  }

  $wrangler = Get-Command wrangler -ErrorAction SilentlyContinue
  if ($wrangler) { return @{ File = $wrangler.Source; Prefix = @() } }

  $npx = Get-Command npx -ErrorAction SilentlyContinue
  if ($npx) { return @{ File = $npx.Source; Prefix = @("--yes", "wrangler@$WranglerVersion") } }

  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpm) { return @{ File = $pnpm.Source; Prefix = @("dlx", "wrangler@$WranglerVersion") } }

  if ($env:USERPROFILE) {
    $codexPnpm = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
    if (Test-Path -LiteralPath $codexPnpm) {
      return @{ File = $codexPnpm; Prefix = @("dlx", "wrangler@$WranglerVersion") }
    }
  }

  throw "Wrangler, npx, and pnpm were not found. Install Node.js or Wrangler 4.x first."
}

function Invoke-Wrangler {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  $allArguments = @($script:Wrangler.Prefix) + $Arguments
  $command = $script:Wrangler.File
  $output = & $command @allArguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = @($output | ForEach-Object { $_.ToString() })
  if ($exitCode -ne 0) {
    throw "Wrangler failed with exit code ${exitCode}:`n$($text -join "`n")"
  }
  return $text
}

function ConvertFrom-WranglerJson {
  param([Parameter(Mandatory = $true)][string[]]$Lines)
  $text = ($Lines -join "`n") -replace "\x1b\[[0-9;?]*[ -/]*[@-~]", ""
  $startMatch = [regex]::Match($text, "(?m)^\s*[\[{]")
  if (-not $startMatch.Success) { throw "Wrangler did not return parseable JSON." }
  $start = $startMatch.Index + [Math]::Max($startMatch.Value.IndexOf("["), $startMatch.Value.IndexOf("{"))
  try {
    return ($text.Substring($start) | ConvertFrom-Json)
  } catch {
    throw "Could not parse Wrangler JSON: $($_.Exception.Message)"
  }
}

function Invoke-D1Rows {
  param([Parameter(Mandatory = $true)][string]$Sql)
  $raw = Invoke-Wrangler -Arguments @("d1", "execute", $script:DatabaseName, "--remote", "--command", $Sql, "--json")
  $payload = ConvertFrom-WranglerJson -Lines $raw
  $rows = @()
  foreach ($entry in @($payload)) {
    if ($entry.PSObject.Properties.Name -contains "results") { $rows += @($entry.results) }
  }
  return $rows
}

function Get-RemoteState {
  $tableRows = @(Invoke-D1Rows -Sql "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
  $tables = @($tableRows | ForEach-Object { [string]$_.name })
  $siteCount = 0
  if ($tables -contains "sites") {
    $countRows = @(Invoke-D1Rows -Sql "SELECT COUNT(*) AS site_count FROM sites;")
    if ($countRows.Count -gt 0) { $siteCount = [int64]$countRows[0].site_count }
  }

  $applied = @()
  if ($tables -contains "d1_migrations") {
    $migrationRows = @(Invoke-D1Rows -Sql "SELECT name FROM d1_migrations ORDER BY id;")
    $applied = @($migrationRows | ForEach-Object { [string]$_.name })
  }
  $local = @(Get-ChildItem -LiteralPath $MigrationDirectory -Filter "*.sql" -File | Sort-Object Name | ForEach-Object { $_.Name })
  $pending = @($local | Where-Object { $applied -notcontains $_ })
  return @{ Tables = $tables; SiteCount = $siteCount; Applied = $applied; Local = $local; Pending = $pending }
}

function Show-RemoteState {
  param([Parameter(Mandatory = $true)]$State)
  Write-Host "Remote database: $script:DatabaseName"
  Write-Host "Site count: $($State.SiteCount)"
  Write-Host "Recorded migrations: $($State.Applied.Count)"
  if ($State.Pending.Count -eq 0) {
    Write-Host "Pending migrations: none"
  } else {
    Write-Host "Pending migrations:"
    $State.Pending | ForEach-Object { Write-Host "  - $_" }
  }
}

function New-D1Backup {
  New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
  $path = Join-Path $BackupDirectory "$($script:DatabaseName)-$stamp.sql"
  Invoke-Wrangler -Arguments @("d1", "export", $script:DatabaseName, "--remote", "--output", $path) | ForEach-Object { Write-Host $_ }
  if (-not (Test-Path -LiteralPath $path) -or (Get-Item -LiteralPath $path).Length -le 0) {
    throw "The D1 backup was not created. The operation has stopped."
  }
  Write-Host "Backup created: $path"
  return $path
}

function Confirm-DangerousAction {
  param([Parameter(Mandatory = $true)][string]$Expected, [Parameter(Mandatory = $true)][string]$Prompt)
  if ($Yes) { return }
  $answer = Read-Host "$Prompt Type $Expected to continue"
  if ($answer -cne $Expected) { throw "Input did not match. The operation was cancelled." }
}

try {
  if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "This is not the sakura-nav repository: wrangler.jsonc is missing." }
  $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $database = @($config.d1_databases)[0]
  if (-not $database -or -not $database.database_name) { throw "wrangler.jsonc does not contain a D1 database configuration." }
  $script:DatabaseName = [string]$database.database_name
  $script:Wrangler = Resolve-WranglerCommand
  Push-Location $Root
  try {
    switch ($Action) {
      "Status" {
        Show-RemoteState -State (Get-RemoteState)
      }
      "Backup" {
        New-D1Backup | Out-Null
      }
      "Migrate" {
        $before = Get-RemoteState
        Show-RemoteState -State $before
        if ($before.Pending.Count -eq 0) {
          Write-Host "The database is current. No migration is required."
          break
        }
        $unsafeInitial = @($before.Pending | Where-Object { $_ -match '^000[12]_' })
        if ($before.SiteCount -gt 0 -and $unsafeInitial.Count -gt 0) {
          throw "The database contains $($before.SiteCount) sites while migration 0001 or 0002 is pending. Refusing to apply or baseline initialization migrations."
        }
        if ($before.Tables.Count -eq 0) {
          Write-Host "The database is empty; no pre-migration backup is required."
        } else {
          New-D1Backup | Out-Null
        }
        Confirm-DangerousAction -Expected "APPLY" -Prompt "Only the migrations listed above will be applied."
        Invoke-Wrangler -Arguments @("d1", "migrations", "apply", $script:DatabaseName, "--remote") | ForEach-Object { Write-Host $_ }
        $after = Get-RemoteState
        if ($after.Pending.Count -gt 0) {
          Show-RemoteState -State $after
          throw "Some migrations are still pending. Stop deployment and inspect the Wrangler output."
        }
        Write-Host "All migrations are applied. Site count: $($after.SiteCount)."
      }
      "Restore" {
        if (-not $BackupFile) { throw "Restore requires a .sql path in -BackupFile." }
        $resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
        if ([IO.Path]::GetExtension($resolvedBackup) -ne ".sql") { throw "The restore file must use the .sql extension." }
        New-D1Backup | Out-Null
        Confirm-DangerousAction -Expected "RESTORE" -Prompt "This replaces remote data with the selected backup. A pre-restore backup has been created."
        Invoke-Wrangler -Arguments @("d1", "execute", $script:DatabaseName, "--remote", "--file", $resolvedBackup) | ForEach-Object { Write-Host $_ }
        Invoke-Wrangler -Arguments @("d1", "execute", $script:DatabaseName, "--remote", "--command", "UPDATE settings SET value=CAST(value AS INTEGER)+1, updated_at=CURRENT_TIMESTAMP WHERE key='content_revision';") | ForEach-Object { Write-Host $_ }
        Write-Host "Restore completed. Check admin cards and categories immediately."
        Show-RemoteState -State (Get-RemoteState)
      }
    }
  } finally {
    Pop-Location
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
