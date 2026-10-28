' Starts the Moe's POS print helper hidden in the background.
Set sh = CreateObject("WScript.Shell")
d = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\MoesPrintHelper"
sh.CurrentDirectory = d
sh.Run "cmd /c node """ & d & "\server.cjs"" --share BlackCopper >> """ & d & "\helper.log"" 2>&1", 0, False
