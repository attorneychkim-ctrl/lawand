[CmdletBinding()]
param(
    [string]$ExecutablePath = (Join-Path $PSScriptRoot 'Lawand.DesktopNotifier.exe'),
    [switch]$AllowUnsigned
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ExecutablePath)) {
    throw "Desktop notifier executable not found: $ExecutablePath"
}
$running = Get-Process -Name 'Lawand.DesktopNotifier' -ErrorAction SilentlyContinue
if ($null -ne $running) {
    throw 'LAW& OS 알림이 실행 중입니다. 트레이 메뉴에서 종료한 뒤 다시 설치하세요.'
}
$signature = Get-AuthenticodeSignature -LiteralPath $ExecutablePath
if (-not $AllowUnsigned -and $signature.Status -ne 'Valid') {
    throw "서명되지 않은 개발 빌드입니다. 통제된 로컬 검증만 -AllowUnsigned로 설치할 수 있습니다. 상태: $($signature.Status)"
}

$installDirectory = Join-Path $env:LOCALAPPDATA 'Programs\Lawand\DesktopNotifier'
New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
$installedExecutable = Join-Path $installDirectory 'Lawand.DesktopNotifier.exe'
Copy-Item -LiteralPath $ExecutablePath -Destination $installedExecutable -Force
foreach ($fileName in @('notifier.defaults.json', 'uninstall.ps1', 'README.md')) {
    $source = Join-Path $PSScriptRoot $fileName
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $installDirectory $fileName) -Force
    }
}

$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-Item -Path $runKey -Force | Out-Null
New-ItemProperty -Path $runKey -Name 'LawandDesktopNotifier' `
    -Value ('"{0}"' -f $installedExecutable) -PropertyType String -Force | Out-Null

$startMenuDirectory = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\LAW& OS'
New-Item -ItemType Directory -Path $startMenuDirectory -Force | Out-Null
$shortcutPath = Join-Path $startMenuDirectory 'LAW& OS 알림.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $installedExecutable
$shortcut.WorkingDirectory = $installDirectory
$shortcut.Description = 'LAW& OS Windows PC 업무 알림'
$shortcut.Save()

Start-Process -FilePath $installedExecutable
[pscustomobject]@{
    InstalledExecutable = $installedExecutable
    AutoStart = $true
    Signed = $signature.Status -eq 'Valid'
} | Format-List
