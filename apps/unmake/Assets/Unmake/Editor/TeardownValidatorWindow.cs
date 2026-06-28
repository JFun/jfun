using UnityEditor;
using UnityEngine;
using Unmake.Core;
using Unmake.Unity;

namespace Unmake.EditorTools
{
    /// Unmake ▸ Teardown Validator. Runs the solver on a TeardownObjectAsset, proves it
    /// can be fully taken apart without breakage, prints the optimal order, and stamps
    /// the par back onto the asset. The fairness contract, in one button — the same role
    /// Moraine's BFS solver plays for its boards.
    public sealed class TeardownValidatorWindow : EditorWindow
    {
        TeardownObjectAsset asset;
        string report = "Pick a TeardownObjectAsset, then Validate.";
        bool ok;
        Vector2 scroll;

        [MenuItem("Unmake/Teardown Validator")]
        public static void Open()
        {
            GetWindow<TeardownValidatorWindow>("Teardown Validator");
        }

        void OnGUI()
        {
            EditorGUILayout.LabelField("Validate a teardown object", EditorStyles.boldLabel);
            asset = (TeardownObjectAsset)EditorGUILayout.ObjectField(
                "Object", asset, typeof(TeardownObjectAsset), false);

            using (new EditorGUI.DisabledScope(asset == null))
            {
                if (GUILayout.Button("Validate + stamp par")) Validate();
            }

            EditorGUILayout.Space();
            scroll = EditorGUILayout.BeginScrollView(scroll);
            EditorGUILayout.HelpBox(report, ok ? MessageType.Info : MessageType.Warning);
            EditorGUILayout.EndScrollView();
        }

        void Validate()
        {
            var res = new TeardownSolver().Solve(asset.ToCore());
            if (res.Feasible)
            {
                ok = true;
                report = "✓ Feasible (break-free).\n" +
                         "Par = " + res.Par + " actions   ·   " + res.ExpandedStates + " states explored\n\n" +
                         "Optimal order:\n  " + string.Join("\n  ", res.Order);

                Undo.RecordObject(asset, "Stamp par");
                asset.par = res.Par;
                EditorUtility.SetDirty(asset);
                AssetDatabase.SaveAssetIfDirty(asset);
            }
            else
            {
                ok = false;
                report = "✗ NOT fully disassemblable without breakage.\n" +
                         "Check for: a part nothing can uncover; a fragile part whose " +
                         "'breaks if present' list can never be cleared first; or a fastener " +
                         "hidden behind a cover that also depends on it.";
            }
        }
    }
}
