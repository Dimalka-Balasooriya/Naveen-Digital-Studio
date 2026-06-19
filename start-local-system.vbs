Set shell = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /k ""cd /d """ & root & "\server"" && ""C:\Program Files\nodejs\npm.cmd"" start""", 1, False
shell.Run "cmd /k ""cd /d """ & root & "\client"" && ""C:\Program Files\nodejs\node.exe"" dev-server.mjs""", 1, False
