using System.Collections.Generic;

namespace Unmake.Core
{
    /// A removable part. Removable when (a) every part in CoveredBy is already gone,
    /// and (b) all of its own Fasteners are removed.
    ///
    /// Fragility models tension/ordering hazards (springs, ribbon cables, glass):
    /// if the part is Fragile and any part in BreaksIfPresent is STILL present at the
    /// moment you remove it, it breaks — you keep the part but lose the "intact" star
    /// (and in Challenge mode the level fails). The solver only ever produces
    /// break-free orders, so a fair object always has at least one clean solution.
    public sealed class Part
    {
        public readonly string Id;
        public readonly string DisplayName;
        public readonly List<Fastener> Fasteners = new List<Fastener>();
        public readonly List<string> CoveredBy = new List<string>();
        public bool Fragile;
        public readonly List<string> BreaksIfPresent = new List<string>();

        public Part(string id, string displayName = null)
        {
            Id = id;
            DisplayName = string.IsNullOrEmpty(displayName) ? id : displayName;
        }

        // --- small fluent helpers so SampleObjects / tests read like the design doc ---

        public Part WithFastener(Fastener f) { Fasteners.Add(f); return this; }

        public Part WithScrews(params string[] ids)
        {
            foreach (var id in ids) Fasteners.Add(new Fastener(id));
            return this;
        }

        public Part Under(params string[] coveringPartIds)
        {
            CoveredBy.AddRange(coveringPartIds);
            return this;
        }

        /// Mark fragile: it breaks unless every listed part is removed first.
        public Part FragileUnlessGone(params string[] mustBeRemovedFirst)
        {
            Fragile = true;
            BreaksIfPresent.AddRange(mustBeRemovedFirst);
            return this;
        }
    }
}
