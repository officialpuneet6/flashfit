<#
Offline guard for staging/prod target separation. It does not contact Supabase,
read credentials, apply SQL, or deploy anything.

Example:
  .\scripts\assert-supabase-environment.ps1 -Environment staging `
    -SupabaseUrl $env:SUPABASE_URL -ProjectRef $env:SUPABASE_PROJECT_REF `
    -ProductionProjectRef $env:FLASHFIT_PRODUCTION_PROJECT_REF `
    -StagingProjectRef $env:FLASHFIT_STAGING_PROJECT_REF
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('staging', 'production')]
  [string]$Environment,
  [Parameter(Mandatory = $true)]
  [string]$SupabaseUrl,
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,
  [Parameter(Mandatory = $true)]
  [string]$ProductionProjectRef,
  [Parameter(Mandatory = $true)]
  [string]$StagingProjectRef
)

$uri = $null
if (-not [Uri]::TryCreate($SupabaseUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https') {
  throw 'SUPABASE_URL must be an absolute HTTPS URL.'
}

$expectedHost = "$ProjectRef.supabase.co"
if ($uri.Host -ne $expectedHost) {
  throw 'SUPABASE_URL does not match the provided SUPABASE_PROJECT_REF.'
}
if ($ProductionProjectRef -eq $StagingProjectRef) {
  throw 'Production and staging project refs must be different.'
}

if ($Environment -eq 'staging') {
  if ($ProjectRef -ne $StagingProjectRef) { throw 'Staging target must use FLASHFIT_STAGING_PROJECT_REF.' }
  if ($ProjectRef -eq $ProductionProjectRef) { throw 'Refusing production project as staging target.' }
} else {
  if ($ProjectRef -ne $ProductionProjectRef) { throw 'Production target must use FLASHFIT_PRODUCTION_PROJECT_REF.' }
  if ($ProjectRef -eq $StagingProjectRef) { throw 'Refusing staging project as production target.' }
}

Write-Output "Target guard passed: environment=$Environment project_ref=$ProjectRef"
