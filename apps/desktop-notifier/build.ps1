[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',
    [string]$OutputDirectory,
    [string]$DefaultGatewayBaseUrl = 'https://api.lawandfirm.com',
    [string]$DefaultErpBaseUrl = 'https://erp.lawandfirm.com',
    [string]$CodeSigningCertificateThumbprint,
    [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $projectRoot "artifacts\$Configuration"
}

$frameworkRoot = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $frameworkRoot 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    throw ".NET Framework 4.8 x64 C# compiler not found: $compiler"
}

$iconPath = [IO.Path]::GetFullPath((Join-Path $projectRoot '..\erp\app\favicon.ico'))
if (-not (Test-Path -LiteralPath $iconPath)) {
    throw "LAW& OS application icon was not found: $iconPath"
}

$script:SignToolPath = $null
if (-not [string]::IsNullOrWhiteSpace($CodeSigningCertificateThumbprint)) {
    $signTool = Get-ChildItem -Path 'C:\Program Files (x86)\Windows Kits\10\bin' `
        -Filter 'signtool.exe' -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($null -eq $signTool) {
        throw 'signtool.exe was not found. Install Windows SDK signing tools.'
    }
    $script:SignToolPath = $signTool.FullName
}

function Invoke-CodeSigning {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$ComponentName
    )

    if ([string]::IsNullOrWhiteSpace($CodeSigningCertificateThumbprint)) {
        return
    }
    & $script:SignToolPath sign /sha1 $CodeSigningCertificateThumbprint /fd SHA256 `
        /tr $TimestampUrl /td SHA256 $Path
    if ($LASTEXITCODE -ne 0) {
        throw "$ComponentName signing failed with exit code $LASTEXITCODE"
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid') {
        throw "$ComponentName signature is not valid: $($signature.Status)"
    }
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$defaultsPath = Join-Path $OutputDirectory 'notifier.defaults.json'
[pscustomobject]@{
    GatewayBaseUrl = $DefaultGatewayBaseUrl
    ErpBaseUrl = $DefaultErpBaseUrl
} | ConvertTo-Json | Set-Content -LiteralPath $defaultsPath -Encoding UTF8

$sourceFiles = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src') -Filter '*.cs' |
    Sort-Object Name |
    ForEach-Object { $_.FullName }
$executable = Join-Path $OutputDirectory 'Lawand.DesktopNotifier.exe'
$pdb = Join-Path $OutputDirectory 'Lawand.DesktopNotifier.pdb'

$compilerArguments = @(
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    '/checked+',
    '/warn:4',
    '/langversion:5',
    "/out:$executable",
    "/pdb:$pdb",
    "/win32icon:$iconPath",
    '/debug:pdbonly',
    '/optimize+',
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Net.Http.dll',
    '/reference:System.Runtime.Serialization.dll',
    '/reference:System.Security.dll',
    '/reference:System.Web.Extensions.dll',
    '/reference:System.Windows.Forms.dll',
    '/reference:Microsoft.CSharp.dll'
) + $sourceFiles

if ($Configuration -eq 'Debug') {
    $compilerArguments = $compilerArguments | Where-Object { $_ -ne '/optimize+' }
    $compilerArguments += '/debug:full'
}

& $compiler @compilerArguments
if ($LASTEXITCODE -ne 0) {
    throw "Desktop notifier compilation failed with exit code $LASTEXITCODE"
}

$selfTestExecutable = Join-Path $OutputDirectory 'Lawand.DesktopNotifier.SelfTests.exe'
$selfTestArguments = @(
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/checked+',
    '/warn:4',
    '/langversion:5',
    "/out:$selfTestExecutable",
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    (Join-Path $projectRoot 'src\DeliveryDispositionPolicy.cs'),
    (Join-Path $projectRoot 'src\NotificationPresentation.cs'),
    (Join-Path $projectRoot 'src\UrlSafety.cs'),
    (Join-Path $projectRoot 'tests\DesktopNotifierSelfTests.cs')
)
& $compiler @selfTestArguments
if ($LASTEXITCODE -ne 0) {
    throw "Desktop notifier self-test compilation failed with exit code $LASTEXITCODE"
}
& $selfTestExecutable
if ($LASTEXITCODE -ne 0) {
    throw "Desktop notifier self-tests failed with exit code $LASTEXITCODE"
}

if ($Configuration -eq 'Debug') {
    $previewExecutable = Join-Path $OutputDirectory 'Lawand.DesktopNotifier.PopupPreview.exe'
    $previewArguments = @(
        '/nologo',
        '/target:winexe',
        '/platform:x64',
        '/checked+',
        '/warn:4',
        '/langversion:5',
        "/out:$previewExecutable",
        "/win32icon:$iconPath",
        '/reference:System.dll',
        '/reference:System.Core.dll',
        '/reference:System.Drawing.dll',
        '/reference:System.Windows.Forms.dll',
        (Join-Path $projectRoot 'src\NotificationPresentation.cs'),
        (Join-Path $projectRoot 'src\NotificationPopupForm.cs'),
        (Join-Path $projectRoot 'tests\PopupPreview.cs')
    )
    & $compiler @previewArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Desktop notifier popup preview compilation failed with exit code $LASTEXITCODE"
    }
}

$uninstaller = Join-Path $OutputDirectory 'Lawand.DesktopNotifier.Uninstall.exe'
$uninstallerArguments = @(
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    '/checked+',
    '/warn:4',
    '/langversion:5',
    '/optimize+',
    "/out:$uninstaller",
    "/win32icon:$iconPath",
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Web.Extensions.dll',
    '/reference:System.Windows.Forms.dll',
    '/reference:Microsoft.CSharp.dll',
    (Join-Path $projectRoot 'src\CredentialStore.cs'),
    (Join-Path $projectRoot 'installer\InstallerShared.cs'),
    (Join-Path $projectRoot 'installer\UninstallProgram.cs')
)
& $compiler @uninstallerArguments
if ($LASTEXITCODE -ne 0) {
    throw "Desktop notifier uninstaller compilation failed with exit code $LASTEXITCODE"
}
& $uninstaller --verify
if ($LASTEXITCODE -ne 0) {
    throw "Desktop notifier uninstaller verification failed with exit code $LASTEXITCODE"
}

Invoke-CodeSigning -Path $executable -ComponentName 'Desktop notifier'
Invoke-CodeSigning -Path $uninstaller -ComponentName 'Desktop notifier uninstaller'

$installer = Join-Path $OutputDirectory 'Lawand.DesktopNotifier-v0.1.0-Setup.exe'
$installerArguments = @(
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    '/checked+',
    '/warn:4',
    '/langversion:5',
    '/optimize+',
    "/out:$installer",
    "/win32icon:$iconPath",
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll',
    '/reference:Microsoft.CSharp.dll',
    "/resource:$executable,Lawand.DesktopNotifier.Payload.exe",
    "/resource:$uninstaller,Lawand.DesktopNotifier.UninstallPayload.exe",
    "/resource:$defaultsPath,Lawand.DesktopNotifier.Defaults.json",
    (Join-Path $projectRoot 'installer\InstallerShared.cs'),
    (Join-Path $projectRoot 'installer\SetupProgram.cs')
)
& $compiler @installerArguments
if ($LASTEXITCODE -ne 0) {
    throw "Desktop notifier installer compilation failed with exit code $LASTEXITCODE"
}
Invoke-CodeSigning -Path $installer -ComponentName 'Desktop notifier installer'
& $installer --verify
if ($LASTEXITCODE -ne 0) {
    throw "Desktop notifier installer verification failed with exit code $LASTEXITCODE"
}

$packageDirectory = Join-Path $OutputDirectory 'package'
if (Test-Path -LiteralPath $packageDirectory) {
    Remove-Item -LiteralPath $packageDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null
Copy-Item -LiteralPath $installer -Destination $packageDirectory -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination $packageDirectory -Force

$zipPath = Join-Path $OutputDirectory 'Lawand.DesktopNotifier-v0.1.0-win-x64.zip'
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $packageDirectory '*') -DestinationPath $zipPath
$installerHash = Get-FileHash -LiteralPath $installer -Algorithm SHA256
$archiveHash = Get-FileHash -LiteralPath $zipPath -Algorithm SHA256

[pscustomobject]@{
    Installer = $installer
    InstallerSha256 = $installerHash.Hash
    Archive = $zipPath
    ArchiveSha256 = $archiveHash.Hash
    Architecture = 'x64'
    Signed = -not [string]::IsNullOrWhiteSpace($CodeSigningCertificateThumbprint)
    DefaultGatewayBaseUrl = $DefaultGatewayBaseUrl
    DefaultErpBaseUrl = $DefaultErpBaseUrl
} | Format-List
