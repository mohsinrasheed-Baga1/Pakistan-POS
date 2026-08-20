; ============================================================
; Pakistan POS System — Custom NSIS Installer Script
; v2.10.14: Auto-configures Windows Firewall + Network Sharing
; ============================================================
; This runs DURING install with admin rights (perMachine: true)
; so the customer doesn't need to manually configure Windows settings.

!macro customInstall
  DetailPrint "=== Configuring Pakistan POS Network ==="

  ; 1. Add firewall rule for port 3000 (POS HTTP)
  DetailPrint "Adding firewall rule for Pakistan POS HTTP (port 3000)..."
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Pakistan POS HTTP" dir=in action=allow protocol=TCP localport=3000'

  ; 2. Enable Network Discovery
  DetailPrint "Enabling Network Discovery..."
  nsExec::ExecToLog 'netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes'

  ; 3. Enable File and Printer Sharing
  DetailPrint "Enabling File and Printer Sharing..."
  nsExec::ExecToLog 'netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes'

  ; 4. Set network profile to Private (enables sharing on current network)
  DetailPrint "Setting network profile to Private..."
  nsExec::ExecToLog 'powershell -Command "try { Set-NetConnectionProfile -NetworkCategory Private } catch {}"'

  ; 5. Create network share "ShopPOS" pointing to AppData
  ; (This allows other PCs to access the database via \\THIS-PC\ShopPOS\pos.db)
  DetailPrint "Creating network share 'ShopPOS'..."
  nsExec::ExecToLog 'net share ShopPOS /delete /y'
  ; Note: Share path will be set by the app on first run (it knows the right AppData path)
  ; For now, just enable the sharing service

  ; 6. Enable Windows services required for network sharing
  DetailPrint "Enabling network sharing services..."
  nsExec::ExecToLog 'sc config LanmanServer start= auto'
  nsExec::ExecToLog 'sc config fdPHost start= auto'
  nsExec::ExecToLog 'sc config FDResPub start= auto'
  nsExec::ExecToLog 'sc config SSDPSRV start= auto'
  nsExec::ExecToLog 'sc config upnphost start= auto'

  DetailPrint "=== Pakistan POS Network Configuration Complete ==="
!macroend

!macro customUnInstall
  ; Clean up firewall rule on uninstall
  DetailPrint "Removing Pakistan POS firewall rule..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Pakistan POS HTTP"'

  ; Remove network share
  DetailPrint "Removing Pakistan POS network share..."
  nsExec::ExecToLog 'net share ShopPOS /delete /y'
!macroend
