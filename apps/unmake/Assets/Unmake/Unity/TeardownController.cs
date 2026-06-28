using System;
using UnityEngine;
using Unmake.Core;

namespace Unmake.Unity
{
    /// Thin bridge between input/UI and the pure-C# TeardownSession. The view layer
    /// (meshes, taps, animation) calls TapFastener / TapPart / SetTool and listens to
    /// the events. No game rules live here — they're all in Unmake.Core.
    public sealed class TeardownController : MonoBehaviour
    {
        [SerializeField] TeardownObjectAsset levelAsset;
        [SerializeField] bool autoTool = true; // tap = swap to the right tool automatically

        public TeardownSession Session { get; private set; }

        public event Action<string, RemoveResult> OnFastener; // (id, result)
        public event Action<string, RemoveResult> OnPart;     // (id, result)
        public event Action<int> OnComplete;                  // stars

        void Awake()
        {
            if (levelAsset != null) Load(levelAsset);
        }

        public void Load(TeardownObjectAsset asset)
        {
            levelAsset = asset;
            Session = new TeardownSession(asset.ToCore());
        }

        public RemoveResult TapFastener(string id)
        {
            if (Session == null) return RemoveResult.NotFound;
            var r = autoTool ? Session.RemoveFastenerAutoTool(id) : Session.RemoveFastener(id);
            OnFastener?.Invoke(id, r);
            CheckComplete();
            return r;
        }

        public RemoveResult TapPart(string id)
        {
            if (Session == null) return RemoveResult.NotFound;
            var r = Session.RemovePart(id);
            OnPart?.Invoke(id, r);
            CheckComplete();
            return r;
        }

        public void SetTool(ToolType tool) => Session?.SetTool(tool);

        /// Id of the next thing the player could act on — wire this to the hint button.
        public string Hint() => Session?.NextActionableId();

        void CheckComplete()
        {
            if (Session != null && Session.IsComplete())
                OnComplete?.Invoke(Session.Stars());
        }
    }
}
