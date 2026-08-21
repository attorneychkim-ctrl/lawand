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

foreach ($scriptName in @('install.ps1', 'uninstall.ps1')) {
    $scriptPath = Join-Path $projectRoot $scriptName
    $scriptBytes = [IO.File]::ReadAllBytes($scriptPath)
    $hasUtf8Bom =
        $scriptBytes.Length -ge 3 -and
        $scriptBytes[0] -eq 0xEF -and
        $scriptBytes[1] -eq 0xBB -and
        $scriptBytes[2] -eq 0xBF
    if (-not $hasUtf8Bom) {
        throw "$scriptName must use UTF-8 with BOM for Windows PowerShell 5.1."
    }
}

$frameworkRoot = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $frameworkRoot 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    throw ".NET Framework 4.8 x64 C# compiler not found: $compiler"
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
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
    (Join-Path $projectRoot 'src\DeliveryDispositionPolicy.cs'),
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

if (-not [string]::IsNullOrWhiteSpace($CodeSigningCertificateThumbprint)) {
    $signtool = Get-ChildItem -Path 'C:\Program Files (x86)\Windows Kits\10\bin' `
        -Filter 'signtool.exe' -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($null -eq $signtool) {
        throw 'signtool.exe was not found. Install Windows SDK signing tools.'
    }
    & $signtool.FullName sign /sha1 $CodeSigningCertificateThumbprint /fd SHA256 `
        /tr $TimestampUrl /td SHA256 $executable
    if ($LASTEXITCODE -ne 0) {
        throw "Desktop notifier signing failed with exit code $LASTEXITCODE"
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $executable
    if ($signature.Status -ne 'Valid') {
        throw "Desktop notifier signature is not valid: $($signature.Status)"
    }
}

$packageDirectory = Join-Path $OutputDirectory 'package'
if (Test-Path -LiteralPath $packageDirectory) {
    Remove-Item -LiteralPath $packageDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null
Copy-Item -LiteralPath $executable -Destination $packageDirectory -Force
if ($Configuration -eq 'Debug') {
    Copy-Item -LiteralPath $pdb -Destination $packageDirectory -Force
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'install.ps1') -Destination $packageDirectory -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'uninstall.ps1') -Destination $packageDirectory -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination $packageDirectory -Force

[pscustomobject]@{
    GatewayBaseUrl = $DefaultGatewayBaseUrl
    ErpBaseUrl = $DefaultErpBaseUrl
} | ConvertTo-Json | Set-Content `
    -LiteralPath (Join-Path $packageDirectory 'notifier.defaults.json') `
    -Encoding UTF8

$zipPath = Join-Path $OutputDirectory 'Lawand.DesktopNotifier-v0.1.0-win-x64.zip'
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $packageDirectory '*') -DestinationPath $zipPath
$hash = Get-FileHash -LiteralPath $zipPath -Algorithm SHA256

[pscustomobject]@{
    Executable = $executable
    Package = $zipPath
    Architecture = 'x64'
    Sha256 = $hash.Hash
    Signed = -not [string]::IsNullOrWhiteSpace($CodeSigningCertificateThumbprint)
    DefaultGatewayBaseUrl = $DefaultGatewayBaseUrl
    DefaultErpBaseUrl = $DefaultErpBaseUrl
} | Format-List
