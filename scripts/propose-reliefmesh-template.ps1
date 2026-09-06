$ErrorActionPreference = "Stop"

$BaseUrl = "https://lab.tagroot.io"
$HostName = "lab.tagroot.io"

$TemplatePath = Join-Path $PSScriptRoot "..\contracts\ReliefMeshMissionAssignment.xml"
$TemplatePath = [System.IO.Path]::GetFullPath($TemplatePath)

if (!(Test-Path $TemplatePath)) {
  throw "Template not found: $TemplatePath"
}

Write-Host ""
Write-Host "ReliefMesh Mission Assignment - Template Proposal"
Write-Host "Target: $BaseUrl"
Write-Host "Template: $TemplatePath"
Write-Host ""

$UserName = Read-Host "Agent API username"
$SecurePassword = Read-Host "Agent API password" -AsSecureString

$Ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)

try {
  $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr)

  # Login nonce: random 32 bytes -> hex = 64 characters
  $RandomBytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($RandomBytes)
  $Nonce = -join ($RandomBytes | ForEach-Object { $_.ToString("x2") })

  # Documented login signature:
  # HMAC-SHA256(password, username:host:nonce)
  $Data = "$UserName`:$HostName`:$Nonce"

  $Hmac = New-Object System.Security.Cryptography.HMACSHA256
  $Hmac.Key = [Text.Encoding]::UTF8.GetBytes($Password)

  $Hash = $Hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($Data))
  $Signature = [Convert]::ToBase64String($Hash)

  $LoginBody = @{
    userName  = $UserName
    nonce     = $Nonce
    signature = $Signature
    seconds   = 600
  } | ConvertTo-Json

  Write-Host ""
  Write-Host "Authenticating..."

  $Login = Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/Agent/Account/Login" `
    -ContentType "application/json" `
    -Body $LoginBody

  if (!$Login.jwt) {
    throw "Login succeeded without returning a JWT."
  }

  Write-Host "Authentication PASS"
  Write-Host ""

  $XmlBytes = [System.IO.File]::ReadAllBytes($TemplatePath)
  $TemplateBase64 = [Convert]::ToBase64String($XmlBytes)

  Write-Host "PRE-FLIGHT"
  Write-Host "Template: ReliefMesh Mission Assignment"
  Write-Host "Roles: Coordinator, Volunteer"
  Write-Host "Machine action: Nop"
  Write-Host "canActAsTemplate: true"
  Write-Host ""
  Write-Host "WARNING: Next step proposes ONE real template to Lab."
  Write-Host ""

  $Confirm = Read-Host "Type PROPOSE to continue"

  if ($Confirm -ne "PROPOSE") {
    Write-Host "Cancelled. Nothing proposed."
    exit 0
  }

  $ProposalBody = @{
    templateBase64 = $TemplateBase64
  } | ConvertTo-Json

  Write-Host ""
  Write-Host "Submitting template exactly once..."

  $Headers = @{
    Authorization = "Bearer $($Login.jwt)"
  }

  $Response = Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/Agent/Legal/ProposeTemplate" `
    -Headers $Headers `
    -ContentType "application/json" `
    -Body $ProposalBody

  Write-Host ""
  Write-Host "TEMPLATE_PROPOSAL=PASS"
  Write-Host ""

  # Show returned template object but never JWT/password.
  $Response.Template | ConvertTo-Json -Depth 12

}
finally {
  if ($Ptr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr)
  }

  $Password = $null
  $SecurePassword = $null
  $Login = $null
}