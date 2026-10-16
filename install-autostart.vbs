' Startup folder mein Pizza Town ka shortcut banata hai
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
d = fso.GetParentFolderName(WScript.ScriptFullName)
Set lnk = sh.CreateShortcut(sh.SpecialFolders("Startup") & "\PizzaTown.lnk")
lnk.TargetPath = "wscript.exe"
lnk.Arguments = Chr(34) & d & "\start-hidden.vbs" & Chr(34)
lnk.WorkingDirectory = d
lnk.Save
