using UnityEditor;
using UnityEngine;

namespace GAP.Editor
{
    /// <summary>
    /// Custom inspector for GAPSceneProfile that disables override fields
    /// unless their corresponding checkbox is enabled.
    /// </summary>
    [CustomEditor(typeof(GAPSceneProfile))]
    public class GAPSceneProfileInspector : UnityEditor.Editor
    {
        private SerializedProperty _overrideCollectionMode;
        private SerializedProperty _collectionMode;
        private SerializedProperty _overrideBatchPolicy;
        private SerializedProperty _batchPolicy;
        private SerializedProperty _sceneMetadata;

        private void OnEnable()
        {
            _overrideCollectionMode = serializedObject.FindProperty("overrideCollectionMode");
            _collectionMode = serializedObject.FindProperty("collectionMode");
            _overrideBatchPolicy = serializedObject.FindProperty("overrideBatchPolicy");
            _batchPolicy = serializedObject.FindProperty("batchPolicy");
            _sceneMetadata = serializedObject.FindProperty("sceneMetadata");
        }

        public override void OnInspectorGUI()
        {
            serializedObject.Update();

            // Collection Mode Override
            EditorGUILayout.LabelField("Collection Mode", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_overrideCollectionMode, new GUIContent("Override Collection Mode"));

            EditorGUI.BeginDisabledGroup(!_overrideCollectionMode.boolValue);
            EditorGUI.indentLevel++;
            EditorGUILayout.PropertyField(_collectionMode, new GUIContent("Collection Mode"));
            EditorGUI.indentLevel--;
            EditorGUI.EndDisabledGroup();

            EditorGUILayout.Space();

            // Batch Policy Override
            EditorGUILayout.LabelField("Batch Policy", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_overrideBatchPolicy, new GUIContent("Override Batch Policy"));

            EditorGUI.BeginDisabledGroup(!_overrideBatchPolicy.boolValue);
            EditorGUI.indentLevel++;
            EditorGUILayout.PropertyField(_batchPolicy, true);
            EditorGUI.indentLevel--;
            EditorGUI.EndDisabledGroup();

            EditorGUILayout.Space();

            // Scene Metadata (always editable)
            EditorGUILayout.LabelField("Scene Metadata", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_sceneMetadata, true);

            serializedObject.ApplyModifiedProperties();
        }
    }
}
