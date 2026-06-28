using System.Collections.Generic;

namespace Unmake.Core
{
    public sealed class SolveResult
    {
        public bool Feasible;
        public int Par;                                  // minimal actions for an intact full teardown
        public int ExpandedStates;
        public List<string> Order = new List<string>();  // human-readable optimal action list
    }

    /// Design-time validator + par oracle — the studio "tests are the contract" move
    /// (cf. Moraine's BFS solver that proves every board solvable and par-optimal).
    ///
    /// Dijkstra over state = (removed fasteners, removed parts, current tool). Only
    /// break-free part removals are allowed, so a Feasible result proves a fair INTACT
    /// solution exists, and Par is its optimal action count (fastener removals + part
    /// lifts + tool swaps). Same input → same Par and same Order (deterministic).
    ///
    /// Bit-packs into longs, so it supports up to 62 fasteners and 62 parts — far more
    /// than any hand-authored casual object. It's an editor/test tool, not runtime.
    public sealed class TeardownSolver
    {
        public int MaxStates = 500000; // guard so a mis-authored object can't hang the editor

        public SolveResult Solve(TeardownObject obj)
        {
            var result = new SolveResult();
            var parts = obj.Parts;
            int nParts = parts.Count;

            var fastIds = new List<string>();
            var fastOwner = new List<int>();
            var fastList = new List<Fastener>();
            for (int i = 0; i < nParts; i++)
                for (int j = 0; j < parts[i].Fasteners.Count; j++)
                {
                    fastIds.Add(parts[i].Fasteners[j].Id);
                    fastOwner.Add(i);
                    fastList.Add(parts[i].Fasteners[j]);
                }
            int nFast = fastIds.Count;

            if (nParts > 62 || nFast > 62)
            {
                result.Feasible = false; // out of bit-pack range; not expected for casual objects
                return result;
            }

            var dist = new Dictionary<string, int>();
            var prev = new Dictionary<string, string>();
            var prevAction = new Dictionary<string, string>();
            var pq = new SortedSet<PqKey>();

            string startSig = Sig(0L, 0L, ToolType.None);
            dist[startSig] = 0;
            pq.Add(new PqKey(0, startSig, 0L, 0L, ToolType.None));

            int expanded = 0;
            PqKey goal = null;

            while (pq.Count > 0)
            {
                var cur = pq.Min;
                pq.Remove(cur);

                if (!dist.TryGetValue(cur.Sig, out var dcur) || dcur != cur.Cost) continue; // stale
                expanded++;
                if (expanded > MaxStates) { result.Feasible = false; result.ExpandedStates = expanded; return result; }

                if (PopCount(cur.RemovedParts) == nParts) { goal = cur; break; }

                // remove a reachable fastener
                for (int f = 0; f < nFast; f++)
                {
                    long bit = 1L << f;
                    if ((cur.RemovedFast & bit) != 0) continue;
                    int owner = fastOwner[f];
                    if ((cur.RemovedParts & (1L << owner)) != 0) continue;
                    if (!UncoveredIdx(parts, owner, cur.RemovedParts)) continue;

                    var fa = fastList[f];
                    if (fa.RevealedAfter != null)
                    {
                        int raIdx = IndexOfPart(parts, fa.RevealedAfter);
                        if (raIdx >= 0 && (cur.RemovedParts & (1L << raIdx)) == 0) continue;
                    }

                    int swap = (fa.Tool != ToolType.None && cur.Tool != fa.Tool) ? 1 : 0;
                    ToolType nt = (fa.Tool == ToolType.None) ? cur.Tool : fa.Tool;
                    string label = (swap == 1 ? "[tool:" + nt + "] " : "") + "unscrew " + fastIds[f];
                    Relax(dist, prev, prevAction, pq, cur, cur.Cost + 1 + swap,
                          cur.RemovedFast | bit, cur.RemovedParts, nt, label);
                }

                // lift a part (uncovered, all fasteners gone, break-free only)
                for (int p = 0; p < nParts; p++)
                {
                    long pbit = 1L << p;
                    if ((cur.RemovedParts & pbit) != 0) continue;
                    if (!UncoveredIdx(parts, p, cur.RemovedParts)) continue;
                    if (!AllFastGoneIdx(partIdx: p, fastOwner: fastOwner, removedFast: cur.RemovedFast, nFast: nFast)) continue;

                    var part = parts[p];
                    if (part.Fragile && !BreakFreeIdx(parts, part, cur.RemovedParts)) continue;

                    Relax(dist, prev, prevAction, pq, cur, cur.Cost + 1,
                          cur.RemovedFast, cur.RemovedParts | pbit, cur.Tool, "lift " + part.Id);
                }
            }

            result.ExpandedStates = expanded;
            if (goal == null) { result.Feasible = false; return result; }

            result.Feasible = true;
            result.Par = goal.Cost;

            var rev = new List<string>();
            string s = goal.Sig;
            while (prevAction.ContainsKey(s)) { rev.Add(prevAction[s]); s = prev[s]; }
            rev.Reverse();
            result.Order = rev;
            return result;
        }

        /// Just the par; -1 if the object can't be fully taken apart intact.
        public int ComputePar(TeardownObject obj)
        {
            var r = Solve(obj);
            return r.Feasible ? r.Par : -1;
        }

        // ---- helpers ----

        void Relax(Dictionary<string, int> dist, Dictionary<string, string> prev,
                   Dictionary<string, string> prevAction, SortedSet<PqKey> pq,
                   PqKey cur, int ncost, long nf, long np, ToolType nt, string action)
        {
            string sig = Sig(nf, np, nt);
            if (dist.TryGetValue(sig, out var old) && old <= ncost) return;
            dist[sig] = ncost;
            prev[sig] = cur.Sig;
            prevAction[sig] = action;
            pq.Add(new PqKey(ncost, sig, nf, np, nt));
        }

        static bool UncoveredIdx(List<Part> parts, int idx, long removedParts)
        {
            var cov = parts[idx].CoveredBy;
            for (int i = 0; i < cov.Count; i++)
            {
                int c = IndexOfPart(parts, cov[i]);
                if (c >= 0 && (removedParts & (1L << c)) == 0) return false;
            }
            return true;
        }

        static bool AllFastGoneIdx(int partIdx, List<int> fastOwner, long removedFast, int nFast)
        {
            for (int f = 0; f < nFast; f++)
            {
                if (fastOwner[f] != partIdx) continue;
                if ((removedFast & (1L << f)) == 0) return false;
            }
            return true;
        }

        static bool BreakFreeIdx(List<Part> parts, Part part, long removedParts)
        {
            for (int i = 0; i < part.BreaksIfPresent.Count; i++)
            {
                int idx = IndexOfPart(parts, part.BreaksIfPresent[i]);
                if (idx >= 0 && (removedParts & (1L << idx)) == 0) return false;
            }
            return true;
        }

        static int IndexOfPart(List<Part> parts, string id)
        {
            for (int i = 0; i < parts.Count; i++) if (parts[i].Id == id) return i;
            return -1;
        }

        static int PopCount(long v)
        {
            int c = 0;
            while (v != 0) { v &= (v - 1); c++; }
            return c;
        }

        static string Sig(long nf, long np, ToolType t)
        {
            return nf.ToString() + ":" + np.ToString() + ":" + ((int)t).ToString();
        }

        sealed class PqKey : System.IComparable<PqKey>
        {
            public readonly int Cost;
            public readonly string Sig;
            public readonly long RemovedFast;
            public readonly long RemovedParts;
            public readonly ToolType Tool;

            public PqKey(int cost, string sig, long rf, long rp, ToolType t)
            {
                Cost = cost; Sig = sig; RemovedFast = rf; RemovedParts = rp; Tool = t;
            }

            public int CompareTo(PqKey other)
            {
                if (other == null) return 1;
                int c = Cost.CompareTo(other.Cost);
                if (c != 0) return c;
                return string.CompareOrdinal(Sig, other.Sig); // unique + deterministic ordering
            }
        }
    }
}
