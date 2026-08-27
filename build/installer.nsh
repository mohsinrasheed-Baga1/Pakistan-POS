; ============================================================
; Pakistan POS System — Custom NSIS Installer Script
; v2.10.14: Auto-configures Windows Firewall + Network Sharing
; v2.10.35: Database moved to install folder — preserve on uninstall
; ============================================================
; This runs DURING install with admin rights (perMachine: true)
; so the customer doesn't need to manually configure Windows settings.

!include "FileFunc.nsh"
!include "LogicLib.nsh"

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

  ; 5. Create network share "ShopPOS" pointing to the data folder in install dir
  ; (v2.10.35: Now points to $INSTDIR\data instead of AppData)
  DetailPrint "Creating network share 'ShopPOS'..."
  nsExec::ExecToLog 'net share ShopPOS /delete /y'
  nsExec::ExecToLog 'net share ShopPOS="$INSTDIR\data" /GRANT:Everyone,FULL'

  ; 6. Enable Windows services required for network sharing
  DetailPrint "Enabling network sharing services..."
  nsExec::ExecToLog 'sc config LanmanServer start= auto'
  nsExec::ExecToLog 'sc config fdPHost start= auto'
  nsExec::ExecToLog 'sc config FDResPub start= auto'
  nsExec::ExecToLog 'sc config SSDPSRV start= auto'
  nsExec::ExecToLog 'sc config upnphost start= auto'

  ; 7. v2.10.35: Grant write permission to the data folder for all users
  ;    (so the app can write to $INSTDIR\data\pos.db without admin rights)
  DetailPrint "Setting write permissions on data folder..."
  nsExec::ExecToLog 'icacls "$INSTDIR\data" /grant:r Users:(OI)(CI)F /T /C'

  ; v2.10.35: DB migration from old AppData location is handled by the
  ; Electron app on first launch (see main.cjs migrateDbFromAppData function).
  ; We don't do it here because NSIS quoting of paths with spaces (e.g.
  ; "Pakistan POS") is error-prone.

  DetailPrint "=== Pakistan POS Network Configuration Complete ==="
!macroend

!macro customUnInstall
  ; Clean up firewall rule on uninstall
  DetailPrint "Removing Pakistan POS firewall rule..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Pakistan POS HTTP"'

  ; Remove network share
  DetailPrint "Removing Pakistan POS network share..."
  nsExec::ExecToLog 'net share ShopPOS /delete /y'

  ; v2.10.35: ASK the user if they want to keep the database
  ; (We do NOT delete $INSTDIR\data automatically — only NSIS's
  ;  default uninstaller removes files it installed, but our `data`
  ;  folder was created by the app, not by the installer, so NSIS
  ;  will leave it alone by default. We just inform the user.)
  DetailPrint "Database files in $INSTDIR\data will be preserved."
  DetailPrint "If you want to fully remove the database, manually delete the data folder."
!macroend
