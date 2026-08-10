[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$BridgeExecutable,
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath,
    [Parameter(Mandatory = $true)]
    [string]$OcxPath,
    [string]$RunAsUser = "$env:USERDOMAIN\$env:USERNAME",
    [switch]$AllowUnsignedBridge,
    [switch]$SkipOcxRegistration,
    [switch]$StartAfterInstall,
    [switch]$MigrateLegacySingleInstance,
    [string]$LegacyTaskName = 'Lawand Centrex Bridge'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-PeMachine([string]$Path) {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 256 -or $bytes[0] -ne 0x4d -or $bytes[1] -ne 0x5a) {
        throw "Not a PE file: $Path"
    }

    $offset = [BitConverter]::ToInt32($bytes, 0x3c)
    if ($offset -lt 0 -or $offset + 6 -gt $bytes.Length) {
        throw "Invalid PE header: $Path"
    }

    return [BitConverter]::ToUInt16($bytes, $offset + 4)
}

$BridgeExecutable = (Resolve-Path -LiteralPath $BridgeExecutable).Path
$ConfigurationPath = (Resolve-Path -LiteralPath $ConfigurationPath).Path
$OcxPath = (Resolve-Path -LiteralPath $OcxPath).Path

if ((Get-PeMachine -Path $BridgeExecutable) -ne 0x014c) {
    throw 'Centrex bridge must be an x86 PE executable.'
}
if ((Get-PeMachine -Path $OcxPath) -ne 0x014c) {
    throw 'LGUBaseOpenApi.ocx must be an x86 PE file.'
}

$ocxSignature = Get-AuthenticodeSignature -LiteralPath $OcxPath
if ($ocxSignature.Status -ne 'Valid' -or
    $null -eq $ocxSignature.SignerCertificate -or
    $ocxSignature.SignerCertificate.Subject -notmatch 'BMLINK') {
    throw 'Official OCX signature verification failed.'
}

$bridgeSignature = Get-AuthenticodeSignature -LiteralPath $BridgeExecutable
if (-not $AllowUnsignedBridge -and $bridgeSignature.Status -ne 'Valid') {
    throw 'Unsigned bridge builds are blocked. Sign it or use -AllowUnsignedBridge only for a controlled canary.'
}

$configuration = Get-Content -LiteralPath $ConfigurationPath -Raw -Encoding UTF8 |
    ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$configuration.bridgeId) -or
    [string]::IsNullOrWhiteSpace([string]$configuration.endpointId) -or
    [string]::IsNullOrWhiteSpace([string]$configuration.credentialTarget) -or
    [string]::IsNullOrWhiteSpace([string]$configuration.gatewayUrl) -or
    [string]::IsNullOrWhiteSpace([string]$configuration.gatewayCredentialTarget)) {
    throw 'Configuration must include bridge, endpoint, Centrex credential, and gateway settings.'
}
$bridgeId = [string]$configuration.bridgeId
if ($bridgeId -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$') {
    throw 'bridgeId format is invalid.'
}
if (-not ([string]$configuration.credentialTarget).StartsWith('Lawand/Centrex/')) {
    throw 'credentialTarget must start with Lawand/Centrex/.'
}
if (-not ([string]$configuration.gatewayCredentialTarget).StartsWith('Lawand/CentrexGateway/')) {
    throw 'gatewayCredentialTarget must start with Lawand/CentrexGateway/.'
}
$gatewayUri = [Uri]([string]$configuration.gatewayUrl)
if ($gatewayUri.Scheme -ne 'https' -or
    $gatewayUri.AbsolutePath -ne '/v1/centrex-bridge/events' -or
    -not [string]::IsNullOrEmpty($gatewayUri.Query) -or
    -not [string]::IsNullOrEmpty($gatewayUri.Fragment)) {
    throw 'gatewayUrl must be the HTTPS /v1/centrex-bridge/events endpoint.'
}

$installDirectory = Join-Path ${env:ProgramFiles(x86)} 'Lawand\CentrexBridge'
$dataRoot = Join-Path $env:ProgramData 'Lawand\CentrexBridge'
$dataDirectory = Join-Path (Join-Path $dataRoot 'instances') $bridgeId
$installedExecutable = Join-Path $installDirectory 'Lawand.CentrexBridge.exe'
$installedOcx = Join-Path $installDirectory 'LGUBaseOpenApi.ocx'
$installedConfiguration = Join-Path $dataDirectory 'bridge.json'
$taskName = "Lawand Centrex Bridge ($bridgeId)"
if ([string]::IsNullOrWhiteSpace($LegacyTaskName) -or
    $LegacyTaskName -eq $taskName) {
    throw 'LegacyTaskName must identify a different scheduled task.'
}

if ($PSCmdlet.ShouldProcess($dataDirectory, "Install Centrex bridge instance $bridgeId")) {
    New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null

    if (Test-Path -LiteralPath $installedExecutable) {
        $sourceHash = (Get-FileHash -LiteralPath $BridgeExecutable -Algorithm SHA256).Hash
        $installedHash = (Get-FileHash -LiteralPath $installedExecutable -Algorithm SHA256).Hash
        if ($sourceHash -ne $installedHash) {
            $runningBridge = Get-Process -Name 'Lawand.CentrexBridge' -ErrorAction SilentlyContinue
            if ($null -ne $runningBridge) {
                throw 'Stop all Lawand Centrex Bridge scheduled tasks before replacing the shared executable.'
            }
            Copy-Item -LiteralPath $BridgeExecutable -Destination $installedExecutable -Force
        }
    }
    else {
        Copy-Item -LiteralPath $BridgeExecutable -Destination $installedExecutable -Force
    }

    if (-not (Test-Path -LiteralPath $installedOcx) -or
        (Get-FileHash -LiteralPath $OcxPath -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath $installedOcx -Algorithm SHA256).Hash) {
        Copy-Item -LiteralPath $OcxPath -Destination $installedOcx -Force
    }
    Copy-Item -LiteralPath $ConfigurationPath -Destination $installedConfiguration -Force

    if (-not $SkipOcxRegistration) {
        $register = Start-Process -FilePath "$env:WINDIR\SysWOW64\regsvr32.exe" `
            -ArgumentList @('/s', $installedOcx) -Wait -PassThru
        if ($register.ExitCode -ne 0) {
            throw "OCX registration failed with exit code $($register.ExitCode)"
        }
    }

    if ($MigrateLegacySingleInstance) {
        $legacyTask = Get-ScheduledTask -TaskName $LegacyTaskName -ErrorAction SilentlyContinue
        if ($null -ne $legacyTask) {
            Stop-ScheduledTask -TaskName $LegacyTaskName -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $LegacyTaskName -Confirm:$false
        }
    }

    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    $wasRunning = $null -ne $existingTask -and $existingTask.State -eq 'Running'
    if ($wasRunning) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    }

    $action = New-ScheduledTaskAction -Execute $installedExecutable `
        -Argument "--config `"$installedConfiguration`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $RunAsUser
    $principal = New-ScheduledTaskPrincipal -UserId $RunAsUser `
        -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Days 0)
    $task = New-ScheduledTask -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings `
        -Description "Lawand x86 STA ActiveX host for LG U+ Centrex bridge $bridgeId."
    Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null

    if ($StartAfterInstall -or $wasRunning) {
        Start-ScheduledTask -TaskName $taskName
    }

    Write-Host ''
    Write-Host "Installation completed for bridge $bridgeId."
    Write-Host "1. Provision credential as the same Windows user:"
    Write-Host "   & '$installedExecutable' --config '$installedConfiguration' --provision-credential"
    Write-Host '2. Provision the gateway HMAC credential as the same Windows user:'
    Write-Host "   & '$installedExecutable' --config '$installedConfiguration' --provision-gateway-credential"
    if (-not $StartAfterInstall -and -not $wasRunning) {
        Write-Host "3. Start the scheduled task: Start-ScheduledTask -TaskName '$taskName'"
    }
}
