[CmdletBinding()]
param(
    [string]$BridgeIdPrefix = 'lawand-slot-',
    [ValidateRange(1, 50)]
    [int]$WarmIdleSlots = 5
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($BridgeIdPrefix -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{2,60}$') {
    throw 'BridgeIdPrefix format is invalid.'
}

$instanceRoot = Join-Path $env:ProgramData 'Lawand\CentrexBridge\instances'
if (-not (Test-Path -LiteralPath $instanceRoot)) {
    exit 0
}

function Test-PendingConfiguration {
    param([Parameter(Mandatory = $true)][string]$Path)

    $configuration = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 |
        ConvertFrom-Json
    $pendingProperty = $configuration.PSObject.Properties['poolSlotPending']
    return ($null -ne $pendingProperty -and $pendingProperty.Value -eq $true) -or
        ([string]$configuration.expectedExtension -eq '0000' -and
         [string]$configuration.expectedLineLast4 -eq '0000')
}

function Start-BridgeTask {
    param([Parameter(Mandatory = $true)]$Instance)

    if ($Instance.TaskState -ne 'Running') {
        Start-ScheduledTask -TaskName $Instance.TaskName
        $Instance.TaskState = 'Running'
        return 'started'
    }
    return 'unchanged'
}

$taskByName = @{}
Get-ScheduledTask | Where-Object {
    $_.TaskName -like 'Lawand Centrex Bridge (*'
} | ForEach-Object {
    $taskByName[$_.TaskName] = $_
}

$instances = @(Get-ChildItem -LiteralPath $instanceRoot -Directory |
    Where-Object { $_.Name.StartsWith($BridgeIdPrefix, [StringComparison]::Ordinal) } |
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
        $taskName = "Lawand Centrex Bridge ($($_.Name))"
        $task = $taskByName[$taskName]
        if ($null -eq $task) {
            throw "Bridge scheduled task is missing: $($_.Name)"
        }
        [pscustomobject]@{
            BridgeId = $_.Name
            TaskName = $taskName
            ConfigurationPath = $configurationPath
            Pending = $pending
            TaskState = [string]$task.State
        }
    })

$assigned = @($instances | Where-Object { -not $_.Pending })
$started = @()
foreach ($instance in $assigned) {
    $outcome = Start-BridgeTask -Instance $instance
    if ($outcome -eq 'started') {
        $started += $instance.BridgeId
    }
}

$runningIdle = @($instances | Where-Object {
    $_.Pending -and $_.TaskState -eq 'Running'
})

$stopped = @()
$excess = [math]::Max(0, $runningIdle.Count - $WarmIdleSlots)
if ($excess -gt 0) {
    @($runningIdle | Sort-Object BridgeId -Descending |
        Select-Object -First $excess) |
        ForEach-Object {
            # A provisioning command can turn an idle config into an assigned
            # config while this supervisor pass is running. Re-read immediately
            # before stopping so a newly assigned bridge is never reclaimed.
            if (Test-PendingConfiguration -Path $_.ConfigurationPath) {
                Stop-ScheduledTask -TaskName $_.TaskName
                $_.TaskState = 'Ready'
                $stopped += $_.BridgeId
            }
        }
}

# Refresh configuration once after the stop pass. A provisioning command can
# change an idle slot into an assigned slot while this supervisor pass runs.
foreach ($instance in $instances) {
    $instance.Pending = Test-PendingConfiguration `
        -Path $instance.ConfigurationPath
    if (-not $instance.Pending -and $instance.TaskState -ne 'Running') {
        $outcome = Start-BridgeTask -Instance $instance
        if ($outcome -eq 'started') {
            $started += $instance.BridgeId
        }
    }
}

$runningIdle = @($instances | Where-Object {
    $_.Pending -and $_.TaskState -eq 'Running'
})
$needed = [math]::Max(0, $WarmIdleSlots - $runningIdle.Count)
if ($needed -gt 0) {
    @($instances |
        Where-Object {
            $_.Pending -and $_.TaskState -ne 'Running'
        } |
        Select-Object -First $needed) |
        ForEach-Object {
            $outcome = Start-BridgeTask -Instance $_
            if ($outcome -eq 'started') {
                $started += $_.BridgeId
            }
        }
}

$runningIdle = @($instances | Where-Object {
    $_.Pending -and $_.TaskState -eq 'Running'
})

[pscustomobject]@{
    Installed = $instances.Count
    Assigned = $assigned.Count
    WarmIdleTarget = $WarmIdleSlots
    WarmIdleRunning = $runningIdle.Count
    Started = $started
    Restarted = @()
    Stopped = $stopped
} | ConvertTo-Json -Compress
