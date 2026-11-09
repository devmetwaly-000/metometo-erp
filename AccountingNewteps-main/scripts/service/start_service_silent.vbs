' ============================================================================
' MultiBranch POS ERP - Silent Service Launcher (تشغيل الخدمة في الخلفية بدون شاشة سوداء)
' ============================================================================
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = fso.GetParentFolderName(fso.GetParentFolderName(scriptDir))
daemonScript = scriptDir & "\meto_pos_daemon.js"

' الانتقال لمجلد التطبيق والتشغيل في الخلفية بدون نافذة (0 = SW_HIDE)
WshShell.CurrentDirectory = appDir
WshShell.Run "node """ & daemonScript & """", 0, False

Set WshShell = Nothing
Set fso = Nothing

