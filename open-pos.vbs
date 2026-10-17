' Desktop icon: server na chal raha ho to chala deta hai, phir POS kholta hai
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
d = fso.GetParentFolderName(WScript.ScriptFullName)
Function Up()
  On Error Resume Next
  Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  h.setTimeouts 1500, 1500, 1500, 1500
  h.open "GET", "http://localhost:3000/api/sync/pending", False
  h.send
  Up = (Err.Number = 0 And h.Status = 200)
End Function
If Not Up() Then
  sh.Run "wscript.exe """ & d & "\start-hidden.vbs""", 0, False
  For i = 1 To 20
    WScript.Sleep 1000
    If Up() Then Exit For
  Next
End If
chrome = ""
For Each p In Array(sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe")
  If fso.FileExists(p) Then chrome = p : Exit For
Next
If chrome <> "" Then
  sh.Run """" & chrome & """ --app=http://localhost:3000", 1, False
Else
  sh.Run "http://localhost:3000", 1, False
End If
