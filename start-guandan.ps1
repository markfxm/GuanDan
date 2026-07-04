param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendUrl = "http://127.0.0.1:5173/"
$ApiUrl = "http://127.0.0.1:5174/api/deal"
$LogDir = Join-Path $ProjectRoot "logs"

function Test-HttpOk {
  param(
    [string]$Url,
    [string]$Method = "GET",
    [string]$Body = ""
  )

  try {
    $options = @{
      Uri = $Url
      Method = $Method
      UseBasicParsing = $true
      TimeoutSec = 3
    }

    if ($Body -ne "") {
      $options.ContentType = "application/json"
      $options.Body = $Body
    }

    $response = Invoke-WebRequest @options
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
}

function Wait-For {
  param(
    [scriptblock]$Check,
    [string]$Name,
    [int]$Seconds = 30
  )

  for ($index = 0; $index -lt $Seconds; $index += 1) {
    if (& $Check) {
      return
    }
    Start-Sleep -Seconds 1
  }

  throw "$Name did not become ready within $Seconds seconds."
}

function Start-NpmService {
  param(
    [string]$ScriptName,
    [string]$LogName
  )

  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
  $logPath = Join-Path $LogDir $LogName
  $command = "cd /d `"$ProjectRoot`" && npm run $ScriptName > `"$logPath`" 2>&1"

  Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $command) -WindowStyle Hidden | Out-Null
}

function Stop-ExistingProjectServices {
  $escapedRoot = [regex]::Escape($ProjectRoot)
  $ownProcessId = $PID

  Get-CimInstance Win32_Process |
    Where-Object {
      $_.ProcessId -ne $ownProcessId -and
      $_.CommandLine -match $escapedRoot -and
      (
        $_.CommandLine -match "npm run api" -or
        $_.CommandLine -match "npm run dev" -or
        $_.CommandLine -match "src/server/dev\.ts" -or
        $_.CommandLine -match "vite"
      )
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Set-Location $ProjectRoot
Stop-ExistingProjectServices

Start-NpmService -ScriptName "api" -LogName "guandan-api.log"

Wait-For -Name "Guandan API" -Check {
  Test-HttpOk -Url $ApiUrl -Method "POST" -Body '{"rank":"10"}'
}

Start-NpmService -ScriptName "dev" -LogName "guandan-frontend.log"

Wait-For -Name "Guandan frontend" -Check {
  Test-HttpOk -Url $FrontendUrl
}

if (-not $NoBrowser) {
  Start-Process $FrontendUrl | Out-Null
}

Write-Host "Guandan game is ready: $FrontendUrl"
