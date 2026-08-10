[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$BridgeExecutable,
    [Parameter(Mandatory = $true)]
    [string]$OcxPath,
    [Parameter(Mandatory = $true)]
    [string]$GatewayUrl,
    [Parameter(Mandatory = $true)]
    [string]$RegistrySecretId,
    [string]$BridgeIdPrefix = 'lawand-slot-',
    [string]$RunAsUser = "$env:USERDOMAIN\$env:USERNAME",
    [ValidateRange(1, 200)]
    [int]$MaximumSlots = 100,
    [ValidateRange(0, 199)]
    [int]$InstallOffset = 0,
    [ValidateRange(1, 200)]
    [int]$InstallLimit = 200,
    [ValidateRange(1, 50)]
    [int]$WarmIdleSlots = 5,
    [switch]$AllowUnsignedBridge
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($RegistrySecretId -notmatch '^lawand/[A-Za-z0-9/_-]{3,180}$') {
    throw 'RegistrySecretId format is invalid.'
}
if ($BridgeIdPrefix -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{2,60}$') {
    throw 'BridgeIdPrefix format is invalid.'
}

$gatewayUri = [Uri]$GatewayUrl
if ($gatewayUri.Scheme -ne 'https' -or
    $gatewayUri.AbsolutePath -ne '/v1/centrex-bridge/events' -or
    -not [string]::IsNullOrEmpty($gatewayUri.Query) -or
    -not [string]::IsNullOrEmpty($gatewayUri.Fragment)) {
    throw 'GatewayUrl must be the HTTPS /v1/centrex-bridge/events endpoint.'
}

$BridgeExecutable = (Resolve-Path -LiteralPath $BridgeExecutable).Path
$OcxPath = (Resolve-Path -LiteralPath $OcxPath).Path
$installScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'install.ps1'
$supervisorSource = Join-Path `
    (Split-Path -Parent $MyInvocation.MyCommand.Path) `
    'bridge-pool-supervisor.ps1'
if (-not (Test-Path -LiteralPath $supervisorSource)) {
    throw 'The bridge pool supervisor script is missing.'
}
$healthMonitorSource = Join-Path `
    (Split-Path -Parent $MyInvocation.MyCommand.Path) `
    'bridge-health-monitor.ps1'
$loadCanarySource = Join-Path `
    (Split-Path -Parent $MyInvocation.MyCommand.Path) `
    'bridge-load-canary.ps1'
if (-not (Test-Path -LiteralPath $healthMonitorSource) -or
    -not (Test-Path -LiteralPath $loadCanarySource)) {
    throw 'The bridge health or load canary script is missing.'
}
$installedExecutable = Join-Path ${env:ProgramFiles(x86)} `
    'Lawand\CentrexBridge\Lawand.CentrexBridge.exe'
$installedSupervisor = Join-Path ${env:ProgramFiles(x86)} `
    'Lawand\CentrexBridge\bridge-pool-supervisor.ps1'
$installedHealthMonitor = Join-Path ${env:ProgramFiles(x86)} `
    'Lawand\CentrexBridge\bridge-health-monitor.ps1'
$installedLoadCanary = Join-Path ${env:ProgramFiles(x86)} `
    'Lawand\CentrexBridge\bridge-load-canary.ps1'
$instanceRoot = Join-Path $env:ProgramData 'Lawand\CentrexBridge\instances'

$aws = Join-Path $env:ProgramFiles 'Amazon\AWSCLIV2\aws.exe'
if (-not (Test-Path -LiteralPath $aws)) {
    $aws = 'aws.exe'
}

$registryJson = & $aws secretsmanager get-secret-value `
    --region ap-northeast-2 `
    --secret-id $RegistrySecretId `
    --query SecretString `
    --output text
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($registryJson)) {
    throw 'Unable to read the bridge registry from AWS Secrets Manager.'
}

try {
    $registry = $registryJson | ConvertFrom-Json
    $bridgeMap = if ($null -ne $registry.bridges) { $registry.bridges } else { $registry }
    $entries = @($bridgeMap.PSObject.Properties |
        Where-Object { $_.Name.StartsWith($BridgeIdPrefix, [StringComparison]::Ordinal) } |
        Sort-Object Name)
    if ($entries.Count -eq 0) {
        throw 'The registry contains no bridge slots matching the requested prefix.'
    }
    if ($entries.Count -gt $MaximumSlots) {
        throw "The registry slot count exceeds MaximumSlots($MaximumSlots)."
    }
    $entries = @($entries |
        Select-Object -Skip $InstallOffset -First $InstallLimit)
    if ($entries.Count -eq 0) {
        throw 'The requested bridge slot installation range is empty.'
    }

    $installedOcx = Join-Path ${env:ProgramFiles(x86)} `
        'Lawand\CentrexBridge\LGUBaseOpenApi.ocx'
    $registeredOcx = (Test-Path -LiteralPath $installedOcx) -and
        ((Get-FileHash -LiteralPath $installedOcx -Algorithm SHA256).Hash -eq
         (Get-FileHash -LiteralPath $OcxPath -Algorithm SHA256).Hash)
    foreach ($entry in $entries) {
        $bridgeId = [string]$entry.Name
        $value = $entry.Value
        if ($bridgeId -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$' -or
            [string]$value.endpointId -notmatch
                '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' -or
            [string]::IsNullOrWhiteSpace([string]$value.secret)) {
            throw "Registry bridge entry is invalid: $bridgeId"
        }

        $installedConfiguration = Join-Path `
            (Join-Path $instanceRoot $bridgeId) `
            'bridge.json'
        if (Test-Path -LiteralPath $installedConfiguration) {
            $configuration = Get-Content -LiteralPath $installedConfiguration `
                -Raw -Encoding UTF8 | ConvertFrom-Json
            if ([string]$configuration.bridgeId -ne $bridgeId) {
                throw "Installed bridge configuration identity mismatch: $bridgeId"
            }
        }
        else {
            $configuration = [ordered]@{
                bridgeId = $bridgeId
                endpointId = [string]$value.endpointId
                credentialTarget = "Lawand/Centrex/$bridgeId"
                gatewayUrl = $gatewayUri.AbsoluteUri
                gatewayCredentialTarget = "Lawand/CentrexGateway/$bridgeId"
                expectedExtension = '0000'
                expectedLineLast4 = '0000'
                autoReconnectSeconds = 20
                healthCheckSeconds = 15
                logRetentionDays = 14
                gatewayTimeoutSeconds = 10
                gatewayRetrySeconds = 5
                gatewayCommandPollMilliseconds = 750
                gatewayEventRetentionHours = 168
                showTrayIcon = $false
                poolSlotPending = $true
            }
        }

        $temporaryConfiguration = Join-Path ([IO.Path]::GetTempPath()) `
            ("lawand-centrex-" + $bridgeId + '-' + [Guid]::NewGuid().ToString('N') + '.json')
        try {
            $configuration | ConvertTo-Json -Depth 5 -Compress |
                Set-Content -LiteralPath $temporaryConfiguration -Encoding UTF8
            $installArguments = @{
                BridgeExecutable = $BridgeExecutable
                ConfigurationPath = $temporaryConfiguration
                OcxPath = $OcxPath
                RunAsUser = $RunAsUser
            }
            if ($AllowUnsignedBridge) {
                $installArguments.AllowUnsignedBridge = $true
            }
            if ($registeredOcx) {
                $installArguments.SkipOcxRegistration = $true
            }
            & $installScript @installArguments
            $registeredOcx = $true

            & $installedExecutable `
                --config $installedConfiguration `
                --provision-gateway-from-aws-secret $RegistrySecretId
            if ($LASTEXITCODE -ne 0) {
                throw "Gateway credential provisioning failed: $bridgeId"
            }
        }
        finally {
            Remove-Item -LiteralPath $temporaryConfiguration -Force -ErrorAction SilentlyContinue
        }
    }

    Copy-Item -LiteralPath $supervisorSource `
        -Destination $installedSupervisor -Force
    Copy-Item -LiteralPath $healthMonitorSource `
        -Destination $installedHealthMonitor -Force
    Copy-Item -LiteralPath $loadCanarySource `
        -Destination $installedLoadCanary -Force
    $quotedSupervisor = '"' + $installedSupervisor + '"'
    $supervisorArguments =
        "-NoProfile -NonInteractive -ExecutionPolicy Bypass " +
        "-File $quotedSupervisor -BridgeIdPrefix $BridgeIdPrefix " +
        "-WarmIdleSlots $WarmIdleSlots"
    $supervisorAction = New-ScheduledTaskAction `
        -Execute "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -Argument $supervisorArguments
    $logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $RunAsUser
    $periodicTrigger = New-ScheduledTaskTrigger -Once `
        -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes 1) `
        -RepetitionDuration (New-TimeSpan -Days 3650)
    $supervisorPrincipal = New-ScheduledTaskPrincipal -UserId $RunAsUser `
        -LogonType Interactive -RunLevel Limited
    $supervisorSettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
    $supervisorTask = New-ScheduledTask `
        -Action $supervisorAction `
        -Trigger @($logonTrigger, $periodicTrigger) `
        -Principal $supervisorPrincipal `
        -Settings $supervisorSettings `
        -Description 'Maintains assigned Centrex bridges and a bounded warm idle pool.'
    Register-ScheduledTask `
        -TaskName 'Lawand Centrex Bridge Pool Supervisor' `
        -InputObject $supervisorTask -Force | Out-Null

    $quotedHealthMonitor = '"' + $installedHealthMonitor + '"'
    $healthArguments =
        "-NoProfile -NonInteractive -ExecutionPolicy Bypass " +
        "-File $quotedHealthMonitor -BridgeIdPrefix $BridgeIdPrefix " +
        "-ExpectedWarmIdleSlots $WarmIdleSlots"
    $healthAction = New-ScheduledTaskAction `
        -Execute "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -Argument $healthArguments
    $healthStartupTrigger = New-ScheduledTaskTrigger -AtStartup
    $healthPeriodicTrigger = New-ScheduledTaskTrigger -Once `
        -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes 1) `
        -RepetitionDuration (New-TimeSpan -Days 3650)
    $healthPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' `
        -LogonType ServiceAccount -RunLevel Highest
    $healthSettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
    $healthTask = New-ScheduledTask `
        -Action $healthAction `
        -Trigger @($healthStartupTrigger, $healthPeriodicTrigger) `
        -Principal $healthPrincipal `
        -Settings $healthSettings `
        -Description 'Publishes non-PII Centrex bridge health metrics.'
    Register-ScheduledTask `
        -TaskName 'Lawand Centrex Bridge Health Monitor' `
        -InputObject $healthTask -Force | Out-Null

    & $installedSupervisor `
        -BridgeIdPrefix $BridgeIdPrefix `
        -WarmIdleSlots $WarmIdleSlots
    if ($LASTEXITCODE -ne 0) {
        throw 'The initial bridge pool supervisor run failed.'
    }

    Write-Host "Centrex bridge pool installation completed. slots=$($entries.Count) warm=$WarmIdleSlots"
}
finally {
    $registryJson = $null
    $registry = $null
}
