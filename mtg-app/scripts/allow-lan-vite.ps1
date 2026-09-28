$ErrorActionPreference = 'Stop'
Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private -ErrorAction SilentlyContinue
Get-NetFirewallRule -DisplayName 'Node.js JavaScript Runtime' | Where-Object { $_.Action -eq 'Block' } | Disable-NetFirewallRule

foreach ($port in 3000, 8090) {
  $ruleName = "MTG LAN $port"
  Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any | Out-Null
}

Write-Host 'OK: ports 3000 (Vite) et 8090 (PocketBase) ouverts pour le LAN'
