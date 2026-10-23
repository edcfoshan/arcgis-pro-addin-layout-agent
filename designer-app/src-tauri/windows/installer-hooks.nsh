; productName 曾更名，旧英文卸载键不会被 NSIS 自动识别为同一安装。
; 只卸载发布方、主程序和卸载器都匹配的旧安装；历史残留不阻塞新安装。
!macro JisigMigrateLegacyInstall LEGACY_NAME
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACY_NAME}" "InstallLocation"
  ${If} $R0 != ""
    ; Tauri 的 InstallLocation 带外层双引号。
    StrCpy $R1 $R0 1
    ${If} $R1 == '$\"'
      StrCpy $R0 $R0 -1 1
    ${EndIf}
    GetFullPathName $R0 "$R0"
    ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACY_NAME}" "Publisher"
    ReadRegStr $R3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACY_NAME}" "MainBinaryName"
    ${If} $R0 != $INSTDIR
    ${AndIf} $R2 == "jisig"
    ${AndIf} $R3 == "${MAINBINARYNAME}.exe"
    ${AndIf} ${FileExists} "$R0\${MAINBINARYNAME}.exe"
    ${AndIf} ${FileExists} "$R0\uninstall.exe"
      ; 拒绝目录联接/符号链接，避免旧卸载器操作到其他位置。
      System::Call 'kernel32::GetFileAttributesW(w "$R0") i .r4'
      IntOp $4 $4 & 0x400
      ${If} $4 == 0
        DetailPrint "迁移旧安装：${LEGACY_NAME}"
        ClearErrors
        ExecWait '$\"$R0\uninstall.exe$\" /S _?=$R0' $R2
        ${If} ${Errors}
          Abort "旧版本卸载器无法启动，请先在 Windows 设置中卸载 ${LEGACY_NAME} 后重试。"
        ${EndIf}
        ${If} $R2 != 0
          Abort "旧版本卸载失败，请先在 Windows 设置中卸载 ${LEGACY_NAME} 后重试。"
        ${EndIf}
        ; _?= 令卸载器同步运行，退出后再移除它自身；只删除空目录。
        Delete "$R0\uninstall.exe"
        RMDir "$R0"
        DeleteRegKey HKCU "Software\jisig\${LEGACY_NAME}"
        ; 从旧名称更新时也需要创建新的中文快捷方式。
        StrCpy $UpdateMode 0
      ${Else}
        DetailPrint "跳过链接形式的旧安装：${LEGACY_NAME}"
      ${EndIf}
    ${Else}
      DetailPrint "跳过不匹配的旧安装记录：${LEGACY_NAME}"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro JisigMigrateLegacyInstall "JisigG-GISpro-Addin-Designer"
  !insertmacro JisigMigrateLegacyInstall "JisigG-Ribbon-Designer"
  !insertmacro JisigMigrateLegacyInstall "极思G GISpro 插件设计器"
!macroend

; 更新模式会跳过创建快捷方式；仍需纠正已存在入口的目标。
!macro JisigRepairShortcut LINK
  ${If} ${FileExists} "${LINK}"
    CreateShortcut "${LINK}" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\app-icon.ico" 0
    !insertmacro SetLnkAppUserModelId "${LINK}"
  ${EndIf}
!macroend

!macro JisigRefreshShellIcons
  ; SHCNE_ASSOCCHANGED asks Explorer to discard cached image/icon associations.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro JisigRemoveLegacyShortcut LINK LEGACY_NAME
  !insertmacro IsShortcutTarget "${LINK}" "$LOCALAPPDATA\${LEGACY_NAME}\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    !insertmacro UnpinShortcut "${LINK}"
    Delete "${LINK}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro JisigRepairShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${If} $AppStartMenuFolder != ""
    !insertmacro JisigRepairShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  ${EndIf}
  !insertmacro JisigRepairShortcut "$DESKTOP\${PRODUCTNAME}.lnk"
  ; 旧快捷方式可能在旧卸载记录已消失后仍残留，只删除目标匹配的入口。
  !insertmacro JisigRemoveLegacyShortcut "$SMPROGRAMS\JisigG-GISpro-Addin-Designer.lnk" "JisigG-GISpro-Addin-Designer"
  !insertmacro JisigRemoveLegacyShortcut "$DESKTOP\JisigG-GISpro-Addin-Designer.lnk" "JisigG-GISpro-Addin-Designer"
  !insertmacro JisigRemoveLegacyShortcut "$SMPROGRAMS\JisigG-Ribbon-Designer.lnk" "JisigG-Ribbon-Designer"
  !insertmacro JisigRemoveLegacyShortcut "$DESKTOP\JisigG-Ribbon-Designer.lnk" "JisigG-Ribbon-Designer"
  !insertmacro JisigRemoveLegacyShortcut "$SMPROGRAMS\极思G GISpro 插件设计器.lnk" "极思G GISpro 插件设计器"
  !insertmacro JisigRemoveLegacyShortcut "$DESKTOP\极思G GISpro 插件设计器.lnk" "极思G GISpro 插件设计器"
  !insertmacro JisigRemoveLegacyShortcut "$DESKTOP\Addin-Designer.lnk" "JisigG-GISpro-Addin-Designer"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\app-icon.ico,0$\""
  !insertmacro JisigRefreshShellIcons
!macroend
