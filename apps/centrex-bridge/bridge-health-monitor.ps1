[CmdletBinding()]
param(
    [string]$BridgeIdPrefix = 'lawand-slot-',
    [string]$AwsRegion = 'ap-northeast-2',
    [string]$CloudWatchNamespace = 'Lawand/CentrexBridge',
    [string]$PoolName = 'primary',
    [ValidateRange(15, 600)]
    [int]$HeartbeatMaxAgeSeconds = 60,
    [ValidateRange(1, 60)]
    [int]$ExpectedWarmIdleSlots = 5,
    [switch]$SkipCloudWatch
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($BridgeIdPrefix -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{2,60}$') {
    throw 'BridgeIdPrefix format is invalid.'
}
if ($CloudWatchNamespace -notmatch '^[A-Za-z0-9/_.-]{3,120}$') {
    throw 'CloudWatchNamespace format is invalid.'
}
if ($PoolName -notmatch '^[A-Za-z0-9_.-]{1,60}$') {
    throw 'PoolName format is invalid.'
}

$dataRoot = Join-Path $env:ProgramData 'Lawand\CentrexBridge'
$instanceRoot = Join-Path $dataRoot 'instances'
$healthPath = Join-Path $dataRoot 'pool-health.json'
$now = [DateTimeOffset]::UtcNow

function Get-LastLoginState {
    param([Parameter(Mandatory = $true)][string]$LogDirectory)

    $latest = Get-ChildItem -LiteralPath $LogDirectory -Filter 'bridge-*.log' `
        -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($null -eq $latest) {
        return 'unknown'
    }
    $line = @(Get-Content -LiteralPath $latest.FullName -Tail 2000 |
        Where-Object {
            $_ -match '\|(LOGIN_RESULT|LOGIN_IDENTITY_MISMATCH)\|'
        } |
        Select-Object -Last 1)
    if ($line.Count -eq 0) {
        return 'unknown'
    }
    if ($line[0] -match '\|LOGIN_IDENTITY_MISMATCH\|') {
        return 'failed'
    }
    if ($line[0] -match '\|LOGIN_RESULT\|STATUS=(-?[0-9]+)') {
        if ([int]$Matches[1] -gt 0) {
            return 'succeeded'
        }
        return 'failed'
    }
    return 'unknown'
}

$taskByName = @{}
Get-ScheduledTask | Where-Object {
    $_.TaskName -like 'Lawand Centrex*'
} | ForEach-Object {
    $taskByName[$_.TaskName] = $_
}

$instances = if (Test-Path -LiteralPath $instanceRoot) {
    @(Get-ChildItem -LiteralPath $instanceRoot -Directory |
        Sort-Object Name |
        ForEach-Object {
            $configurationPath = Join-Path $_.FullName 'bridge.json'
            if (-not (Test-Path -LiteralPath $configurationPath)) {
                return
            }
            $configuration = Get-Content -LiteralPath $configurationPath `
                -Raw -Encoding UTF8 | ConvertFrom-Json
            if ([string]$configuration.bridgeId -ne $_.Name) {
                throw "Bridge configuration identity mismatch: $($_.Name)"
            }
            $pendingProperty = $configuration.PSObject.Properties['poolSlotPending']
            $pending = ($null -ne $pendingProperty -and
                $pendingProperty.Value -eq $true) -or
                ([string]$configuration.expectedExtension -eq '0000' -and
                 [string]$configuration.expectedLineLast4 -eq '0000')
            $task = $taskByName["Lawand Centrex Bridge ($($_.Name))"]
            $heartbeatPath = Join-Path $_.FullName 'gateway-heartbeat.utc'
            $heartbeatAt = $null
            if (Test-Path -LiteralPath $heartbeatPath) {
                $parsed = [DateTimeOffset]::MinValue
                if ([DateTimeOffset]::TryParse(
                    (Get-Content -LiteralPath $heartbeatPath -Raw).Trim(),
                    [ref]$parsed)) {
                    $heartbeatAt = $parsed.ToUniversalTime()
                }
            }
            $heartbeatAge = if ($null -eq $heartbeatAt) {
                [double]::PositiveInfinity
            }
            else {
                [math]::Max(0, ($now - $heartbeatAt).TotalSeconds)
            }
            $queuePath = Join-Path $_.FullName 'gateway-queue'
            $deadLetterPath = Join-Path $_.FullName 'gateway-dead-letter'
            [pscustomobject]@{
                BridgeId = $_.Name
                Pending = $pending
                ProcessRunning = $null -ne $task -and $task.State -eq 'Running'
                HeartbeatAt = if ($null -ne $heartbeatAt) {
                    $heartbeatAt.ToString('o')
                } else { $null }
                HeartbeatAgeSeconds = if ([double]::IsInfinity($heartbeatAge)) {
                    $null
                } else { [math]::Round($heartbeatAge, 1) }
                HeartbeatFresh = $heartbeatAge -le $HeartbeatMaxAgeSeconds
                LoginState = if ($pending) {
                    'idle'
                } else {
                    Get-LastLoginState -LogDirectory (Join-Path $_.FullName 'logs')
                }
                QueueDepth = if (Test-Path -LiteralPath $queuePath) {
                    @(Get-ChildItem -LiteralPath $queuePath -Filter '*.event' `
                        -File -ErrorAction SilentlyContinue).Count
                } else { 0 }
                DeadLetterDepth = if (Test-Path -LiteralPath $deadLetterPath) {
                    @(Get-ChildItem -LiteralPath $deadLetterPath -Filter '*.event' `
                        -File -ErrorAction SilentlyContinue).Count
                } else { 0 }
            }
        })
}
else {
    @()
}

$assigned = @($instances | Where-Object { -not $_.Pending })
$poolIdle = @($instances | Where-Object {
    $_.Pending -and $_.BridgeId.StartsWith(
        $BridgeIdPrefix,
        [StringComparison]::Ordinal)
})
$offline = @($assigned | Where-Object {
    -not $_.ProcessRunning -or -not $_.HeartbeatFresh
})
$loginFailures = @($assigned | Where-Object LoginState -eq 'failed')
$runningIdle = @($poolIdle | Where-Object ProcessRunning)
$queueDepth = (($instances | Measure-Object QueueDepth -Sum).Sum)
if ($null -eq $queueDepth) { $queueDepth = 0 }
$deadLetterDepth = (($instances | Measure-Object DeadLetterDepth -Sum).Sum)
if ($null -eq $deadLetterDepth) { $deadLetterDepth = 0 }
$dpapiQueueDepth = [int]$queueDepth + [int]$deadLetterDepth

$supervisor = $taskByName['Lawand Centrex Bridge Pool Supervisor']
$supervisorInfo = if ($null -ne $supervisor) {
    $supervisor | Get-ScheduledTaskInfo
} else { $null }
$supervisorHealthy = $null -ne $supervisorInfo -and
    $supervisorInfo.LastTaskResult -eq 0 -and
    ($now - [DateTimeOffset]$supervisorInfo.LastRunTime).TotalMinutes -le 3
$supervisorMetricValue = if ($supervisorHealthy) { 1 } else { 0 }

$result = [ordered]@{
    SchemaVersion = 1
    CapturedAt = $now.ToString('o')
    Pool = $PoolName
    Installed = $instances.Count
    Assigned = $assigned.Count
    Running = @($instances | Where-Object ProcessRunning).Count
    WarmIdleRunning = $runningIdle.Count
    ExpectedWarmIdle = $ExpectedWarmIdleSlots
    AssignedOffline = $offline.Count
    LoginFailures = $loginFailures.Count
    QueueDepth = [int]$queueDepth
    DeadLetterDepth = [int]$deadLetterDepth
    DpapiQueueDepth = $dpapiQueueDepth
    SupervisorHealthy = $supervisorHealthy
    OfflineBridgeIds = @($offline | ForEach-Object BridgeId)
    FailedBridgeIds = @($loginFailures | ForEach-Object BridgeId)
}

New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$temporaryHealthPath = $healthPath + '.pending'
try {
    $result | ConvertTo-Json -Depth 5 -Compress |
        Set-Content -LiteralPath $temporaryHealthPath -Encoding UTF8
    Move-Item -LiteralPath $temporaryHealthPath -Destination $healthPath -Force
}
finally {
    Remove-Item -LiteralPath $temporaryHealthPath -Force `
        -ErrorAction SilentlyContinue
}

if (-not $SkipCloudWatch) {
    $aws = Join-Path $env:ProgramFiles 'Amazon\AWSCLIV2\aws.exe'
    if (-not (Test-Path -LiteralPath $aws)) { $aws = 'aws.exe' }
    $dimensions = @(@{ Name = 'Pool'; Value = $PoolName })
    $metricData = @(
        @{ MetricName = 'AssignedOffline'; Unit = 'Count'; Value = $offline.Count; Dimensions = $dimensions },
        @{ MetricName = 'LoginFailures'; Unit = 'Count'; Value = $loginFailures.Count; Dimensions = $dimensions },
        @{ MetricName = 'DpapiQueueDepth'; Unit = 'Count'; Value = $dpapiQueueDepth; Dimensions = $dimensions },
        @{ MetricName = 'SupervisorHealthy'; Unit = 'Count'; Value = $supervisorMetricValue; Dimensions = $dimensions },
        @{ MetricName = 'RunningBridges'; Unit = 'Count'; Value = @($instances | Where-Object ProcessRunning).Count; Dimensions = $dimensions },
        @{ MetricName = 'WarmIdleRunning'; Unit = 'Count'; Value = $runningIdle.Count; Dimensions = $dimensions }
    ) | ConvertTo-Json -Depth 6 -Compress
    $metricPath = Join-Path $dataRoot 'cloudwatch-metrics.pending.json'
    try {
        [IO.File]::WriteAllText(
            $metricPath,
            $metricData,
            (New-Object Text.UTF8Encoding($false)))
        & $aws cloudwatch put-metric-data `
            --region $AwsRegion `
            --namespace $CloudWatchNamespace `
            --metric-data ('file://' + $metricPath)
        if ($LASTEXITCODE -ne 0) {
            throw "CloudWatch metric publishing failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Remove-Item -LiteralPath $metricPath -Force `
            -ErrorAction SilentlyContinue
    }
}

$result | ConvertTo-Json -Depth 5 -Compress
