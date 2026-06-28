// Unmake.Core — pure C#, no UnityEngine. The deterministic heart of the puzzle.
// Mirrors the studio ethos (cf. Moraine's engine.js): the rules are a pure function
// of (object, actions), so the same inputs always produce the same result, and the
// solver below is the contract that proves every shipped object is fair.

namespace Unmake.Core
{
    /// What kind of fastener holds a part on. Flavor + which tool is needed.
    public enum FastenerType { Screw, Bolt, Clip, Pin, Wire, Spring }

    /// The tool currently in hand. None = bare hands / universal (no swap cost).
    public enum ToolType { None, Screwdriver, Wrench, Pliers, Cutter }

    /// Result of attempting an action. Anything other than Ok/Broke is a no-op
    /// (and is counted as a "wasted tap" for the efficiency star).
    public enum RemoveResult
    {
        Ok,            // fastener or part removed cleanly
        NotFound,      // no such id in this object
        AlreadyRemoved,
        Blocked,       // part still covered, or still has fasteners on it
        NotReachable,  // fastener hidden behind a cover that's still on
        WrongTool,     // current tool can't turn this fastener — SetTool first
        TrayFull,      // no free slot to hold another loose part — bin one first
        Broke          // part came off but broke (fragile, removed out of order)
    }
}
