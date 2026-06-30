using UnityEditor;

namespace GAP.Editor
{
    /// <summary>
    /// Editor menu items for GAP operations
    /// </summary>
    public static class GAPEditorMenu
    {
        [MenuItem("Tools/Game Analytics Pipeline/Quick Setup", false, 0)]
        public static void QuickSetup()
        {
            GAPQuickSetupWindow.ShowWindow();
        }

        [MenuItem("Tools/Game Analytics Pipeline/Open Settings", false, 1)]
        public static void OpenSettings()
        {
            SettingsService.OpenProjectSettings("Project/Game Analytics Pipeline");
        }
    }
}
