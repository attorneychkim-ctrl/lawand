[CmdletBinding()]
param(
    [string]$BridgeIdPrefix = 'lawand-slot-',
    [int[]]$TargetProcessCounts = @(10, 25, 50),
    [int[]]$StageDurationSeconds = @(600, 600, 1800),
    [ValidateRange(1, 60)]
    [int]$SampleIntervalSeconds = 5,
    [ValidateRange(1, 50)]
    [int]$RestoreWarmIdleSlots = 5,
    [ValidateRange(256, 8192)]
    [int]$AbortBelowFreeMemoryMB = 768,
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($TargetProcessCounts.Count -ne $StageDurationSeconds.Count -or
    $TargetProcessCounts.Count -eq 0) {
    throw 'TargetProcessCounts and StageDurationSeconds must have the same nonzero length.'
}
if (@($TargetProcessCounts | Where-Object { $_ -lt 1 -or $_ -gt 51 }).Count -gt 0) {
    throw 'Target process counts must be between 1 and 51.'
}

$dataRoot = Join-Path $env:ProgramData 'Lawand\CentrexBridge'
$instanceRoot = Join-Path $dataRoot 'instances'
$supervisor = Join-Path ${env:ProgramFiles(x86)} `
    'Lawand\CentrexBridge\bridge-pool-supervisor.ps1'
if (-not (Test-Path -LiteralPath $supervisor)) {
    throw 'Installed bridge pool supervisor was not found.'
}
$supervisorTaskName = 'Lawand Centrex Bridge Pool Supervisor'
$supervisorTask = Get-ScheduledTask -TaskName $supervisorTaskName `
    -ErrorAction SilentlyContinue
if ($null -eq $supervisorTask) {
    throw 'Bridge pool supervisor scheduled task was not found.'
}
$supervisorWasEnabled = $supervisorTask.State -ne 'Disabled'
if ($supervisorTask.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $supervisorTaskName
}
Disable-ScheduledTask -TaskName $supervisorTaskName | Out-Null
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $dataRoot 'load-canary'
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$samplePath = Join-Path $OutputDirectory "bridge-load-$runId.csv"
$summaryPath = Join-Path $OutputDirectory "bridge-load-$runId.json"

function Get-ConfigurationState {
    $rows = @(Get-ChildItem -LiteralPath $instanceRoot -Directory |
        ForEach-Object {
            $path = Join-Path $_.FullName 'bridge.json'
            if (-not (Test-Path -LiteralPath $path)) { return }
            $configuration = Get-Content -LiteralPath $path -Raw -Encoding UTF8 |
                ConvertFrom-Json
            $pendingProperty = $configuration.PSObject.Properties['poolSlotPending']
            [pscustomobject]@{
                BridgeId = $_.Name
                Pending = ($null -ne $pendingProperty -and
                    $pendingProperty.Value -eq $true) -or
                    ([string]$configuration.expectedExtension -eq '0000' -and
                     [string]$configuration.expectedLineLast4 -eq '0000')
            }
        })
    return $rows
}

function Get-Sample {
    param([int]$Target)

    $processor = Get-CimInstance `
        Win32_PerfFormattedData_PerfOS_Processor `
        -Filter "Name='_Total'"
    $operatingSystem = Get-CimInstance Win32_OperatingSystem
    $processes = @(Get-Process -Name 'Lawand.CentrexBridge' `
        -ErrorAction SilentlyContinue)
    $queueDepth = @(Get-ChildItem -LiteralPath $instanceRoot `
        -Filter '*.event' -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Directory.Name -eq 'gateway-queue' -or
            $_.Directory.Name -eq 'gateway-dead-letter'
        }).Count
    return [pscustomobject]@{
        CapturedAt = [DateTimeOffset]::UtcNow.ToString('o')
        TargetProcesses = $Target
        ProcessCount = $processes.Count
        CpuPercent = [double]$processor.PercentProcessorTime
        FreeMemoryMB = [math]::Round($operatingSystem.FreePhysicalMemory / 1KB, 2)
        WorkingSetMB = [math]::Round((($processes |
            Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 2)
        PrivateMemoryMB = [math]::Round((($processes |
            Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB, 2)
        Handles = [int](($processes | Measure-Object HandleCount -Sum).Sum)
        Threads = [int](($processes | ForEach-Object { $_.Threads.Count } |
            Measure-Object -Sum).Sum)
        QueueDepth = $queueDepth
    }
}

function Get-Percentile {
    param([double[]]$Values, [double]$Percentile)

    if ($Values.Count -eq 0) { return 0 }
    $sorted = @($Values | Sort-Object)
    $index = [math]::Ceiling($Percentile * $sorted.Count) - 1
    return [double]$sorted[[math]::Max(0, $index)]
}

$summaries = @()
$canaryError = $null
try {
    for ($stage = 0; $stage -lt $TargetProcessCounts.Count; $stage++) {
        $target = $TargetProcessCounts[$stage]
        $duration = $StageDurationSeconds[$stage]
        $configuration = Get-ConfigurationState
        $assignedCount = @($configuration | Where-Object { -not $_.Pending }).Count
        $desiredWarm = $target - $assignedCount
        $availableIdle = @($configuration | Where-Object {
            $_.Pending -and $_.BridgeId.StartsWith(
                $BridgeIdPrefix,
                [StringComparison]::Ordinal)
        }).Count
        if ($desiredWarm -lt 1 -or $desiredWarm -gt $availableIdle) {
            throw "Target $target requires $desiredWarm warm slots, available=$availableIdle assigned=$assignedCount."
        }

        & $supervisor -BridgeIdPrefix $BridgeIdPrefix `
            -WarmIdleSlots $desiredWarm | Out-Null

        $deadline = [DateTimeOffset]::UtcNow.AddMinutes(3)
        do {
            Start-Sleep -Seconds 5
            $running = @(Get-Process -Name 'Lawand.CentrexBridge' `
                -ErrorAction SilentlyContinue).Count
        } while ($running -lt $target -and [DateTimeOffset]::UtcNow -lt $deadline)
        if ($running -lt $target) {
            throw "Only $running of $target bridge processes started within three minutes."
        }

        $stageSamples = @()
        $stageDeadline = [DateTimeOffset]::UtcNow.AddSeconds($duration)
        $missingSamples = 0
        do {
            $sample = Get-Sample -Target $target
            $stageSamples += $sample
            $sample | Export-Csv -LiteralPath $samplePath -NoTypeInformation `
                -Append -Encoding UTF8
            if ($sample.FreeMemoryMB -lt $AbortBelowFreeMemoryMB) {
                throw "Free memory fell below $AbortBelowFreeMemoryMB MB at target $target."
            }
            if ($sample.ProcessCount -lt $target) {
                $missingSamples++
            } else {
                $missingSamples = 0
            }
            if ($missingSamples * $SampleIntervalSeconds -ge 60) {
                throw "Bridge process count stayed below target $target for one minute."
            }
            Start-Sleep -Seconds $SampleIntervalSeconds
        } while ([DateTimeOffset]::UtcNow -lt $stageDeadline)

        $summaries += [pscustomobject]@{
            TargetProcesses = $target
            DurationSeconds = $duration
            Samples = $stageSamples.Count
            CpuP95 = [math]::Round((Get-Percentile `
                -Values @($stageSamples.CpuPercent) -Percentile 0.95), 2)
            CpuMax = [math]::Round((($stageSamples |
                Measure-Object CpuPercent -Maximum).Maximum), 2)
            MinimumFreeMemoryMB = [math]::Round((($stageSamples |
                Measure-Object FreeMemoryMB -Minimum).Minimum), 2)
            MaximumWorkingSetMB = [math]::Round((($stageSamples |
                Measure-Object WorkingSetMB -Maximum).Maximum), 2)
            MaximumPrivateMemoryMB = [math]::Round((($stageSamples |
                Measure-Object PrivateMemoryMB -Maximum).Maximum), 2)
            MaximumQueueDepth = [int](($stageSamples |
                Measure-Object QueueDepth -Maximum).Maximum)
        }
    }
}
catch {
    $canaryError = $_.Exception.Message
}
finally {
    try {
        & $supervisor -BridgeIdPrefix $BridgeIdPrefix `
            -WarmIdleSlots $RestoreWarmIdleSlots | Out-Null
    }
    finally {
        if ($supervisorWasEnabled) {
            Enable-ScheduledTask -TaskName $supervisorTaskName | Out-Null
            Start-ScheduledTask -TaskName $supervisorTaskName
        }
    }
}

$result = [ordered]@{
    SchemaVersion = 1
    RunId = $runId
    CompletedAt = [DateTimeOffset]::UtcNow.ToString('o')
    Status = if ($null -eq $canaryError) { 'passed' } else { 'failed' }
    Error = $canaryError
    SamplePath = $samplePath
    Stages = $summaries
    RestoredWarmIdleSlots = $RestoreWarmIdleSlots
}
$result | ConvertTo-Json -Depth 6 |
    Set-Content -LiteralPath $summaryPath -Encoding UTF8
$result | ConvertTo-Json -Depth 6 -Compress
if ($null -ne $canaryError) { exit 1 }
