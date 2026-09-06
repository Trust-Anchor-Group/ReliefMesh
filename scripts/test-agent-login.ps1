$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Force modern TLS in Windows PowerShell 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$BaseUrl = "https://lab.tagroot.io"
$HostName = "lab.tagroot.io"

Write-Host ""
Write-Host "SAFE AGENT API LOGIN TEST"
Write-Host "No template will be proposed."
Write-Host ""

$UserName = Read-Host "Exact account username (local part before @lab.tagroot.io)"
$SecurePassword = Read-Host "Password" -AsSecureString

$Ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)

try {
  $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr)

  $RandomBytes = New-Object byte[] 32
  $Rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $Rng.GetBytes($RandomBytes)
  $Rng.Dispose()

  $Nonce = -join ($RandomBytes | ForEach-Object { $_.ToString("x2") })

  $Data = "$UserName`:$HostName`:$Nonce"

  $Hmac = New-Object System.Security.Cryptography.HMACSHA256
  $Hmac.Key = [Text.Encoding]::UTF8.GetBytes($Password)

  $Hash = $Hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($Data))
  $Hmac.Dispose()

  $Signature = [Convert]::ToBase64String($Hash)

  $LoginBody = @{
    userName  = $UserName
    nonce     = $Nonce
    signature = $Signature
    seconds   = 600
  } | ConvertTo-Json -Compress

  Write-Host ""
  Write-Host "Calling /Agent/Account/Login (20s timeout)..."

  try {
    $Login = Invoke-RestMethod `
      -Method Post `
      -Uri "$BaseUrl/Agent/Account/Login" `
      -ContentType "application/json" `
      -Body $LoginBody `
      -TimeoutSec 20

    if ($Login.jwt) {
      Write-Host ""
      Write-Host "AGENT_LOGIN=PASS"
      Write-Host "Expires: $($Login.expires)"
      Write-Host "JWT received but NOT printed."
    }
    else {
      Write-Host ""
      Write-Host "AGENT_LOGIN=UNEXPECTED_RESPONSE"
      $Login | ConvertTo-Json -Depth 5
    }
  }
  catch {
    Write-Host ""
    Write-Host "AGENT_LOGIN=FAIL"
    Write-Host "Exception: $($_.Exception.Message)"

    if ($_.Exception.Response) {
      try {
        $Status = [int]$_.Exception.Response.StatusCode
        Write-Host "HTTP_STATUS=$Status"

        $Stream = $_.Exception.Response.GetResponseStream()
        if ($Stream) {
          $Reader = New-Object System.IO.StreamReader($Stream)
          $Body = $Reader.ReadToEnd()
          $Reader.Dispose()

          if ($Body) {
            Write-Host "SERVER_RESPONSE=$Body"
          }
        }
      }
      catch {
        Write-Host "Could not read HTTP error body."
      }
    }
  }
}
finally {
  if ($Ptr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr)
  }

  $Password = $null
  $SecurePassword = $null
  $Login = $null
}