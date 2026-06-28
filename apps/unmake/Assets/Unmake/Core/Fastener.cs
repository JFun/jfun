namespace Unmake.Core
{
    /// A single fastener holding a part in place. Remove all of a part's fasteners
    /// (and uncover it) before the part itself can come off.
    public sealed class Fastener
    {
        public readonly string Id;
        public readonly FastenerType Type;
        public readonly ToolType Tool;        // tool needed to remove it; None = any (no swap)
        public readonly int ColorId;          // -1 = none; optional "sort to matching bin" flavor
        public readonly string RevealedAfter; // partId that must be removed first to expose it; null = visible

        public Fastener(
            string id,
            FastenerType type = FastenerType.Screw,
            ToolType tool = ToolType.None,
            int colorId = -1,
            string revealedAfter = null)
        {
            Id = id;
            Type = type;
            Tool = tool;
            ColorId = colorId;
            RevealedAfter = string.IsNullOrEmpty(revealedAfter) ? null : revealedAfter;
        }
    }
}
