[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Get-Process -Name 'Lawand.DesktopNotifier' -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
Remove-ItemProperty -Path $runKey -Name 'LawandDesktopNotifier' `
    -ErrorAction SilentlyContinue
$shortcutPath = Join-Path $env:APPDATA `
    'Microsoft\Windows\Start Menu\Programs\LAW& OS\LAW& OS 알림.lnk'
Remove-Item -LiteralPath $shortcutPath -Force -ErrorAction SilentlyContinue

$settingsPath = Join-Path $env:LOCALAPPDATA 'Lawand\DesktopNotifier\settings.json'
if (Test-Path -LiteralPath $settingsPath) {
    try {
        $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        $gateway = [Uri]$settings.GatewayBaseUrl
        $authority = $gateway.Authority.ToLowerInvariant().Replace(':', '_').Replace('[', '_').Replace(']', '_')
        & cmdkey.exe (('/delete:Lawand/DesktopNotifier/v1/{0}' -f $authority)) | Out-Null
    } catch {
        Write-Warning 'Windows 자격 증명 삭제를 확인하지 못했습니다. 자격 증명 관리자에서 Lawand/DesktopNotifier 항목을 확인하세요.'
    }
}
Remove-Item -LiteralPath (Split-Path -Parent $settingsPath) `
    -Recurse -Force -ErrorAction SilentlyContinue

$installDirectory = Join-Path $env:LOCALAPPDATA 'Programs\Lawand\DesktopNotifier'
Remove-Item -LiteralPath $installDirectory -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'LAW& OS 알림을 제거했습니다.'
