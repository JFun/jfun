using System;
using System.Collections.Generic;
using UnityEngine;
using Unmake.Core;

namespace Unmake.Unity
{
    /// Inspector-authorable level. Designers create these via
    /// Assets ▸ Create ▸ Unmake ▸ Teardown Object, then run the Teardown Validator
    /// (Unmake ▸ Teardown Validator) to prove it's solvable and stamp the par.
    /// ToCore() converts to the pure-C# model the gameplay + solver run on.
    [CreateAssetMenu(menuName = "Unmake/Teardown Object", fileName = "TeardownObject")]
    public sealed class TeardownObjectAsset : ScriptableObject
    {
        [Serializable]
        public class FastenerDef
        {
            public string id;
            public FastenerType type = FastenerType.Screw;
            public ToolType tool = ToolType.None;
            public int colorId = -1;
            [Tooltip("Part id that must be removed before this fastener is reachable. Blank = always visible.")]
            public string revealedAfter = "";
        }

        [Serializable]
        public class PartDef
        {
            public string id;
            public string displayName;
            public List<FastenerDef> fasteners = new List<FastenerDef>();
            [Tooltip("Parts physically on top of this one — they must come off first.")]
            public List<string> coveredBy = new List<string>();
            public bool fragile;
            [Tooltip("If fragile: these parts must be removed BEFORE this one, or it breaks.")]
            public List<string> breaksIfPresent = new List<string>();
        }

        public string id;
        public string displayName;
        [Tooltip("Loose parts you can hold before you must bin one. 0 = unlimited.")]
        public int traySlots = 0;
        [Tooltip("Optimal action count. Stamped by the Teardown Validator — don't hand-edit.")]
        public int par = 0;
        public List<PartDef> parts = new List<PartDef>();

        public TeardownObject ToCore()
        {
            var obj = new TeardownObject(id, string.IsNullOrEmpty(displayName) ? id : displayName, traySlots);
            for (int i = 0; i < parts.Count; i++)
            {
                var pd = parts[i];
                var part = new Part(pd.id, string.IsNullOrEmpty(pd.displayName) ? pd.id : pd.displayName);
                part.CoveredBy.AddRange(pd.coveredBy);
                part.Fragile = pd.fragile;
                part.BreaksIfPresent.AddRange(pd.breaksIfPresent);
                for (int j = 0; j < pd.fasteners.Count; j++)
                {
                    var fd = pd.fasteners[j];
                    part.Fasteners.Add(new Fastener(fd.id, fd.type, fd.tool, fd.colorId, fd.revealedAfter));
                }
                obj.Parts.Add(part);
            }
            obj.Par = par;
            return obj;
        }
    }
}
