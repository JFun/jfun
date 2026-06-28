using NUnit.Framework;
using Unmake.Core;

namespace Unmake.Tests
{
    /// EditMode tests = the fairness + rules contract. Run via Window ▸ General ▸
    /// Test Runner ▸ EditMode ▸ Run All. Mirrors the studio rule that the solver/golden
    /// tests are what make the design safe to ship.
    public class CoreTests
    {
        // ---- solver: feasibility + par oracle ----

        [Test]
        public void PictureFrame_Feasible_Par7()
        {
            var r = new TeardownSolver().Solve(SampleObjects.PictureFrame());
            Assert.IsTrue(r.Feasible, "frame should be fully disassemblable");
            Assert.AreEqual(7, r.Par);
        }

        [Test]
        public void ToyRobot_Feasible_Par12()
        {
            var r = new TeardownSolver().Solve(SampleObjects.ToyRobot());
            Assert.IsTrue(r.Feasible);
            Assert.AreEqual(12, r.Par, "5 fasteners + 6 lifts + 1 wrench swap");
        }

        [Test]
        public void HiddenScrewBox_Feasible_Par4()
        {
            var r = new TeardownSolver().Solve(SampleObjects.HiddenScrewBox());
            Assert.IsTrue(r.Feasible);
            Assert.AreEqual(4, r.Par);
        }

        [Test]
        public void Authored_Par_Matches_Solver()
        {
            // the hand-stamped Par on each sample must equal the solver's optimum
            foreach (var obj in new[] {
                SampleObjects.PictureFrame(), SampleObjects.ToyRobot(), SampleObjects.HiddenScrewBox(),
                SampleObjects.WallClock(), SampleObjects.ToyCar(), SampleObjects.DeskLamp() })
                Assert.AreEqual(new TeardownSolver().ComputePar(obj), obj.Par, obj.Id);
        }

        [Test]
        public void RampLevels_AreFeasible_WithStampedPar()
        {
            // every shipped level must be break-free solvable and its par solver-exact.
            var cases = new[] {
                (obj: SampleObjects.WallClock(), par: 6),
                (obj: SampleObjects.ToyCar(),    par: 6),
                (obj: SampleObjects.DeskLamp(),  par: 11),
            };
            foreach (var c in cases)
            {
                var r = new TeardownSolver().Solve(c.obj);
                Assert.IsTrue(r.Feasible, c.obj.Id + " must be fully disassemblable break-free");
                Assert.AreEqual(c.par, r.Par, c.obj.Id + " par");
            }
        }

        // ---- session: scoring + rules ----

        [Test]
        public void OptimalPlay_ScoresThreeStars()
        {
            var s = new TeardownSession(SampleObjects.ToyRobot());
            Assert.AreEqual(RemoveResult.Ok, s.RemoveFastener("screw_c1"));
            Assert.AreEqual(RemoveResult.Ok, s.RemovePart("chest_panel"));
            s.RemoveFastener("screw_b1"); s.RemoveFastener("screw_b2");
            Assert.AreEqual(RemoveResult.Ok, s.RemovePart("back_plate"));
            Assert.AreEqual(RemoveResult.Ok, s.RemovePart("battery"));
            Assert.AreEqual(RemoveResult.Ok, s.RemovePart("spring")); // chest already off → safe
            s.RemoveFastener("screw_a1"); s.RemovePart("arm_left");
            Assert.AreEqual(RemoveResult.Ok, s.RemoveFastenerAutoTool("bolt_h1"));
            Assert.AreEqual(RemoveResult.Ok, s.RemovePart("head"));

            Assert.IsTrue(s.IsComplete());
            Assert.AreEqual(0, s.WastedTaps);
            Assert.AreEqual(0, s.BrokenParts.Count);
            Assert.AreEqual(12, s.Actions);
            Assert.AreEqual(3, s.Stars());
        }

        [Test]
        public void RemovingFragileSpringEarly_Breaks()
        {
            var s = new TeardownSession(SampleObjects.ToyRobot());
            s.RemoveFastener("screw_b1"); s.RemoveFastener("screw_b2");
            s.RemovePart("back_plate");
            // chest panel still on → spring snaps
            Assert.AreEqual(RemoveResult.Broke, s.RemovePart("spring"));
            Assert.Contains("spring", (System.Collections.ICollection)s.BrokenParts);
        }

        [Test]
        public void TappingCoveredPart_IsBlocked_AndCountsWasted()
        {
            var s = new TeardownSession(SampleObjects.ToyRobot());
            Assert.AreEqual(RemoveResult.Blocked, s.RemovePart("battery")); // under back_plate
            Assert.AreEqual(1, s.WastedTaps);
            Assert.IsFalse(s.IsPartRemoved("battery"));
        }

        [Test]
        public void HiddenFastener_NotReachable_UntilCoverRemoved()
        {
            var s = new TeardownSession(SampleObjects.HiddenScrewBox());
            Assert.AreEqual(RemoveResult.NotReachable, s.RemoveFastener("base_screw"));
            Assert.AreEqual(RemoveResult.Ok, s.RemoveFastener("lid_screw"));
            Assert.AreEqual(RemoveResult.Ok, s.RemovePart("lid"));
            Assert.AreEqual(RemoveResult.Ok, s.RemoveFastener("base_screw")); // now exposed
        }

        // ---- determinism ----

        [Test]
        public void Solver_IsDeterministic()
        {
            var a = new TeardownSolver().Solve(SampleObjects.ToyRobot());
            var b = new TeardownSolver().Solve(SampleObjects.ToyRobot());
            Assert.AreEqual(a.Par, b.Par);
            CollectionAssert.AreEqual(a.Order, b.Order);
        }
    }
}
