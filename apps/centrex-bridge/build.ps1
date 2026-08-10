[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',
    [string]$OutputDirectory,
    [string]$CodeSigningCertificateThumbprint,
    [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $projectRoot "artifacts\$Configuration"
}

$frameworkRoot = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319'
$compiler = Join-Path $frameworkRoot 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    throw ".NET Framework C# compiler not found: $compiler"
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$sourceFiles = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src') -Filter '*.cs' |
    Sort-Object Name |
    ForEach-Object { $_.FullName }
$bridgeExecutable = Join-Path $OutputDirectory 'Lawand.CentrexBridge.exe'
$bridgePdb = Join-Path $OutputDirectory 'Lawand.CentrexBridge.pdb'

$compilerArguments = @(
    '/nologo',
    '/target:winexe',
    '/platform:x86',
    '/checked+',
    "/out:$bridgeExecutable",
    "/pdb:$bridgePdb",
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
    throw "Bridge compilation failed with exit code $LASTEXITCODE"
}

$testExecutable = Join-Path $OutputDirectory 'Lawand.CentrexBridge.SelfTests.exe'
$testArguments = @(
    '/nologo',
    '/target:exe',
    '/platform:x86',
    '/checked+',
    "/out:$testExecutable",
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Security.dll',
    '/reference:System.Web.Extensions.dll',
    (Join-Path $projectRoot 'src\CentrexEventParser.cs'),
    (Join-Path $projectRoot 'src\BridgeConfiguration.cs'),
    (Join-Path $projectRoot 'src\CallObservationExpiryPolicy.cs'),
    (Join-Path $projectRoot 'src\CredentialStore.cs'),
    (Join-Path $projectRoot 'src\GatewaySecretEncoding.cs'),
    (Join-Path $projectRoot 'src\GatewayEventPayload.cs'),
    (Join-Path $projectRoot 'src\GatewayDeliveryDispositionPolicy.cs'),
    (Join-Path $projectRoot 'src\ProvisioningEnvelope.cs'),
    (Join-Path $projectRoot 'src\ProvisioningFailurePolicy.cs'),
    (Join-Path $projectRoot 'tests\BridgeSelfTests.cs')
)
& $compiler @testArguments
if ($LASTEXITCODE -ne 0) {
    throw "Self-test compilation failed with exit code $LASTEXITCODE"
}

& $testExecutable
if ($LASTEXITCODE -ne 0) {
    throw "Self-tests failed with exit code $LASTEXITCODE"
}

Copy-Item -LiteralPath (Join-Path $projectRoot 'config\bridge.example.json') `
    -Destination (Join-Path $OutputDirectory 'bridge.example.json') -Force

if (-not [string]::IsNullOrWhiteSpace($CodeSigningCertificateThumbprint)) {
    $signtool = Get-ChildItem -Path 'C:\Program Files (x86)\Windows Kits\10\bin' `
        -Filter 'signtool.exe' -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($null -eq $signtool) {
        throw 'signtool.exe was not found. Install Windows SDK signing tools.'
    }

    & $signtool.FullName sign /sha1 $CodeSigningCertificateThumbprint /fd SHA256 `
        /tr $TimestampUrl /td SHA256 $bridgeExecutable
    if ($LASTEXITCODE -ne 0) {
        throw "Authenticode signing failed with exit code $LASTEXITCODE"
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $bridgeExecutable
    if ($signature.Status -ne 'Valid') {
        throw "Bridge signature is not valid: $($signature.Status)"
    }
}

$hash = Get-FileHash -LiteralPath $bridgeExecutable -Algorithm SHA256
[pscustomobject]@{
    Executable = $bridgeExecutable
    Architecture = 'x86'
    Sha256 = $hash.Hash
    Signed = -not [string]::IsNullOrWhiteSpace($CodeSigningCertificateThumbprint)
} | Format-List
