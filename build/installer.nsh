!macro customHeader
  ; Custom NSIS header for Shop POS System installer
  ; v2.10.13: Auto-configures Windows Firewall + Network Sharing
!macroend

!macro customInstall
  ; ─── Auto-configure Windows Firewall + Network Sharing (v2.10.13) ───────
  ; This runs automatically during install with admin rights (UAC elevation)
  ; so the customer doesn't need to manually configure Windows settings.

  DetailPrint "Configuring Windows Firewall for Pakistan POS..."
  ; Allow inbound TCP on port 3000 (POS app's HTTP port)
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Pakistan POS HTTP" dir=in action=allow protocol=TCP localport=3000'
  ; Enable Network Discovery
  nsExec::ExecToLog 'netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes'
  ; Enable File and Printer Sharing
  nsExec::ExecToLog 'netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes'

  DetailPrint "Setting network profile to Private (enables file sharing)..."
  ; Set current network profile to Private (so sharing works)
  nsExec::ExecToLog 'powershell -Command "Set-NetConnectionProfile -NetworkCategory Private"'

  DetailPrint "Pakistan POS network configuration complete."
!macroend

!macro customUnInstall
  ; Remove firewall rule on uninstall (optional - keep rule for reinstall)
  DetailPrint "Removing Pakistan POS firewall rule..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Pakistan POS HTTP"'
!macroend
