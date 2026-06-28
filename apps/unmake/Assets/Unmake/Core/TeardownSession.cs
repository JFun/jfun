using System.Collections.Generic;

namespace Unmake.Core
{
    /// Runtime state for one play of a TeardownObject. Pure logic — a controller/UI
    /// calls RemoveFastener / RemovePart / SetTool; nothing here touches UnityEngine.
    public sealed class TeardownSession
    {
        public readonly TeardownObject Object;

        readonly HashSet<string> _removedParts = new HashSet<string>();
        readonly HashSet<string> _removedFasteners = new HashSet<string>();
        readonly List<string> _broken = new List<string>();

        public int Moves { get; private set; }        // fastener + part removals
        public int ToolSwaps { get; private set; }
        public int WastedTaps { get; private set; }    // tapping something not (yet) actionable
        public int LooseInTray { get; private set; }   // removed-but-not-binned parts
        public ToolType CurrentTool { get; private set; } = ToolType.None;

        public TeardownSession(TeardownObject obj) { Object = obj; }

        public int Actions { get { return Moves + ToolSwaps; } }
        public IReadOnlyList<string> BrokenParts { get { return _broken; } }

        public bool IsPartRemoved(string id) { return _removedParts.Contains(id); }
        public bool IsFastenerRemoved(string id) { return _removedFasteners.Contains(id); }
        public bool IsComplete() { return _removedParts.Count == Object.Parts.Count; }

        // ---- queries ----

        public bool IsUncovered(Part p)
        {
            for (int i = 0; i < p.CoveredBy.Count; i++)
                if (!_removedParts.Contains(p.CoveredBy[i])) return false;
            return true;
        }

        public bool AllFastenersRemoved(Part p)
        {
            for (int i = 0; i < p.Fasteners.Count; i++)
                if (!_removedFasteners.Contains(p.Fasteners[i].Id)) return false;
            return true;
        }

        public bool CanRemovePart(Part p)
        {
            return p != null && !_removedParts.Contains(p.Id) && IsUncovered(p) && AllFastenersRemoved(p);
        }

        Part OwnerOf(string fastenerId, out Fastener fastener)
        {
            for (int i = 0; i < Object.Parts.Count; i++)
            {
                var p = Object.Parts[i];
                for (int j = 0; j < p.Fasteners.Count; j++)
                    if (p.Fasteners[j].Id == fastenerId) { fastener = p.Fasteners[j]; return p; }
            }
            fastener = null;
            return null;
        }

        public bool IsFastenerReachable(Fastener f, Part owner)
        {
            if (owner == null || f == null) return false;
            if (_removedParts.Contains(owner.Id)) return false;
            if (!IsUncovered(owner)) return false;
            if (f.RevealedAfter != null && !_removedParts.Contains(f.RevealedAfter)) return false;
            return true;
        }

        // ---- actions ----

        public void SetTool(ToolType tool)
        {
            if (tool == CurrentTool) return;
            CurrentTool = tool;
            ToolSwaps++;
        }

        public RemoveResult RemoveFastener(string id)
        {
            var owner = OwnerOf(id, out var f);
            if (owner == null) { WastedTaps++; return RemoveResult.NotFound; }
            if (_removedFasteners.Contains(id)) { WastedTaps++; return RemoveResult.AlreadyRemoved; }
            if (!IsFastenerReachable(f, owner)) { WastedTaps++; return RemoveResult.NotReachable; }
            if (f.Tool != ToolType.None && CurrentTool != f.Tool) { WastedTaps++; return RemoveResult.WrongTool; }

            _removedFasteners.Add(id);
            Moves++;
            return RemoveResult.Ok;
        }

        /// Auto-swap to the correct tool (counting the swap), then remove. Handy for
        /// a "tap = do the right thing" control scheme.
        public RemoveResult RemoveFastenerAutoTool(string id)
        {
            var owner = OwnerOf(id, out var f);
            if (owner != null && f != null && f.Tool != ToolType.None) SetTool(f.Tool);
            return RemoveFastener(id);
        }

        public RemoveResult RemovePart(string id)
        {
            var p = Object.Get(id);
            if (p == null) { WastedTaps++; return RemoveResult.NotFound; }
            if (_removedParts.Contains(id)) { WastedTaps++; return RemoveResult.AlreadyRemoved; }
            if (!IsUncovered(p)) { WastedTaps++; return RemoveResult.Blocked; }
            if (!AllFastenersRemoved(p)) { WastedTaps++; return RemoveResult.Blocked; }
            if (Object.TraySlots > 0 && LooseInTray >= Object.TraySlots) return RemoveResult.TrayFull; // not a mistake

            _removedParts.Add(id);
            Moves++;
            LooseInTray++;

            if (p.Fragile)
            {
                for (int i = 0; i < p.BreaksIfPresent.Count; i++)
                {
                    if (!_removedParts.Contains(p.BreaksIfPresent[i]))
                    {
                        _broken.Add(id);
                        return RemoveResult.Broke;
                    }
                }
            }
            return RemoveResult.Ok;
        }

        /// Route a held loose part into storage, freeing a tray slot.
        public bool BinOneLoosePart()
        {
            if (LooseInTray <= 0) return false;
            LooseInTray--;
            return true;
        }

        // ---- hints & scoring ----

        /// First currently-actionable id (a reachable fastener, else a removable part),
        /// or null if nothing can be done. Powers the hint button.
        public string NextActionableId()
        {
            for (int i = 0; i < Object.Parts.Count; i++)
            {
                var p = Object.Parts[i];
                if (_removedParts.Contains(p.Id)) continue;
                for (int j = 0; j < p.Fasteners.Count; j++)
                {
                    var f = p.Fasteners[j];
                    if (!_removedFasteners.Contains(f.Id) && IsFastenerReachable(f, p)) return f.Id;
                }
            }
            for (int i = 0; i < Object.Parts.Count; i++)
                if (CanRemovePart(Object.Parts[i])) return Object.Parts[i].Id;
            return null;
        }

        /// 0..3 stars. 1 = completed, +1 = nothing broke, +1 = efficient (no wasted
        /// taps and actions within par).
        public int Stars()
        {
            if (!IsComplete()) return 0;
            int stars = 1;
            bool intact = _broken.Count == 0;
            if (intact) stars++;
            if (intact && WastedTaps == 0 && (Object.Par <= 0 || Actions <= Object.Par)) stars++;
            return stars;
        }

        public void Reset()
        {
            _removedParts.Clear();
            _removedFasteners.Clear();
            _broken.Clear();
            Moves = 0; ToolSwaps = 0; WastedTaps = 0; LooseInTray = 0;
            CurrentTool = ToolType.None;
        }
    }
}
