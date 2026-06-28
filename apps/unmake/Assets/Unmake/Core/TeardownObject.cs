using System.Collections.Generic;

namespace Unmake.Core
{
    /// One level: a single object to fully take apart.
    public sealed class TeardownObject
    {
        public readonly string Id;
        public readonly string DisplayName;
        public readonly List<Part> Parts = new List<Part>();

        /// Loose parts you can hold before you must route one to a bin. 0 = unlimited.
        public int TraySlots;

        /// Optimal action count for the intact solve (set by the solver / authoring tool).
        public int Par;

        public TeardownObject(string id, string displayName = null, int traySlots = 0)
        {
            Id = id;
            DisplayName = string.IsNullOrEmpty(displayName) ? id : displayName;
            TraySlots = traySlots;
        }

        public Part AddPart(Part p) { Parts.Add(p); return p; }

        public Part Get(string id)
        {
            for (int i = 0; i < Parts.Count; i++)
                if (Parts[i].Id == id) return Parts[i];
            return null;
        }

        public int FastenerCount
        {
            get
            {
                int n = 0;
                for (int i = 0; i < Parts.Count; i++) n += Parts[i].Fasteners.Count;
                return n;
            }
        }
    }
}
