using UnityEngine;
using Unmake.Core;

namespace Unmake.Unity
{
    /// Zero-art smoke test. Put this on an empty GameObject and press Play: it solves
    /// the sample robot for par, plays an optimal script, and logs stars — proving the
    /// whole Core loop works before any meshes or UI exist.
    public sealed class Bootstrap : MonoBehaviour
    {
        void Start()
        {
            var obj = SampleObjects.ToyRobot();

            var solve = new TeardownSolver().Solve(obj);
            Debug.Log($"[Unmake] Solver: feasible={solve.Feasible} par={solve.Par} " +
                      $"(asset par={obj.Par}) states={solve.ExpandedStates}");
            Debug.Log("[Unmake] Optimal order: " + string.Join(" → ", solve.Order));

            // Play the optimal, intact order (auto-tool handles the wrench swap).
            var s = new TeardownSession(obj);
            s.RemoveFastener("screw_c1");           s.RemovePart("chest_panel");
            s.RemoveFastener("screw_b1");           s.RemoveFastener("screw_b2");
            s.RemovePart("back_plate");
            s.RemovePart("battery");                s.RemovePart("spring"); // safe: chest panel already off
            s.RemoveFastener("screw_a1");           s.RemovePart("arm_left");
            s.RemoveFastenerAutoTool("bolt_h1");    s.RemovePart("head");

            Debug.Log($"[Unmake] Play: complete={s.IsComplete()} stars={s.Stars()} " +
                      $"actions={s.Actions} par={obj.Par} broken={s.BrokenParts.Count} wasted={s.WastedTaps}");
        }
    }
}
