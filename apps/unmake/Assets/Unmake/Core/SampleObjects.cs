namespace Unmake.Core
{
    /// Hand-built sample objects for tests, the Bootstrap demo, and the editor window.
    /// These are the first rungs of the difficulty ramp in docs/LEVELS.md, expressed
    /// in code so the test suite can prove them fair without any Unity assets.
    public static class SampleObjects
    {
        /// Level 1 — Picture Frame. Pure intro: 4 screws, then a straight cover chain
        /// backboard → photo → glass. No fragility, no tools. Par = 7.
        public static TeardownObject PictureFrame()
        {
            var o = new TeardownObject("frame", "Picture Frame");
            o.AddPart(new Part("backboard", "Backboard").WithScrews("s1", "s2", "s3", "s4"));
            o.AddPart(new Part("photo", "Photo").Under("backboard"));
            o.AddPart(new Part("glass", "Glass").Under("photo"));
            o.Par = 7; // 4 screws + 3 lifts, no swaps
            return o;
        }

        /// Level 5 — Wind-up Robot. Teaches everything at once: covers (battery + spring
        /// sit under the back plate), a fragile spring that snaps unless the chest panel
        /// is off first, and a wrench-only head bolt (one tool swap). Par = 12.
        public static TeardownObject ToyRobot()
        {
            var o = new TeardownObject("robot", "Wind-up Robot");
            o.AddPart(new Part("back_plate", "Back Plate").WithScrews("screw_b1", "screw_b2"));
            o.AddPart(new Part("chest_panel", "Chest Panel").WithScrews("screw_c1"));
            o.AddPart(new Part("battery", "Battery").Under("back_plate"));
            o.AddPart(new Part("spring", "Wind-up Spring").Under("back_plate").FragileUnlessGone("chest_panel"));
            o.AddPart(new Part("arm_left", "Left Arm").WithScrews("screw_a1"));
            o.AddPart(new Part("head", "Head")
                .WithFastener(new Fastener("bolt_h1", FastenerType.Bolt, ToolType.Wrench)));
            o.Par = 12; // 5 fasteners + 6 lifts + 1 wrench swap
            return o;
        }

        /// Tiny object exercising a HIDDEN fastener (revealed only after a cover is off).
        /// Used by the test suite. Par = 4 (2 fasteners + 2 lifts).
        public static TeardownObject HiddenScrewBox()
        {
            var o = new TeardownObject("box", "Hidden-Screw Box");
            // lid is held by one visible screw; removing the lid reveals the base screw.
            o.AddPart(new Part("lid", "Lid").WithScrews("lid_screw"));
            o.AddPart(new Part("base", "Base")
                .WithFastener(new Fastener("base_screw", FastenerType.Screw, ToolType.None, -1, revealedAfter: "lid"))
                .Under("lid"));
            o.Par = 4;
            return o;
        }

        /// Level 2 — Wall Clock. One cover layer: pop the front glass (2 clips) and the
        /// hands + battery underneath all lift free. Teaches "remove cover → reveal".
        /// Par = 6 (2 clips + 4 lifts).
        public static TeardownObject WallClock()
        {
            var o = new TeardownObject("clock", "Wall Clock");
            o.AddPart(new Part("front_glass", "Front Glass")
                .WithFastener(new Fastener("clip_1", FastenerType.Clip))
                .WithFastener(new Fastener("clip_2", FastenerType.Clip)));
            o.AddPart(new Part("hour_hand", "Hour Hand").Under("front_glass"));
            o.AddPart(new Part("minute_hand", "Minute Hand").Under("front_glass"));
            o.AddPart(new Part("battery", "Battery").Under("front_glass"));
            o.Par = 6;
            return o;
        }

        /// Level 3 — Toy Car. A screw hides on the underside: removing the body exposes
        /// the chassis screw (revealedAfter). Teaches the hidden-fastener "flip" rule.
        /// Par = 6 (3 fasteners + 3 lifts).
        public static TeardownObject ToyCar()
        {
            var o = new TeardownObject("car", "Toy Car");
            o.AddPart(new Part("body", "Body").WithScrews("body_s1", "body_s2"));
            o.AddPart(new Part("chassis", "Chassis")
                .Under("body")
                .WithFastener(new Fastener("chassis_screw", FastenerType.Screw, ToolType.None, -1, revealedAfter: "body")));
            o.AddPart(new Part("axle", "Axle Block").Under("chassis"));
            o.Par = 6;
            return o;
        }

        /// Level 4 — Desk Lamp. A deeper cover chain (shade → bulb → reflector → socket)
        /// alongside an arm and a 2-screw base. Teaches depth — a longer ordered run.
        /// Par = 11 (5 fasteners + 6 lifts).
        public static TeardownObject DeskLamp()
        {
            var o = new TeardownObject("lamp", "Desk Lamp");
            o.AddPart(new Part("shade", "Shade").WithFastener(new Fastener("shade_clip", FastenerType.Clip)));
            o.AddPart(new Part("bulb", "Bulb").Under("shade"));
            o.AddPart(new Part("reflector", "Reflector").Under("bulb"));
            o.AddPart(new Part("socket", "Socket").Under("reflector").WithScrews("socket_s1"));
            o.AddPart(new Part("arm", "Arm").WithScrews("arm_s1"));
            o.AddPart(new Part("base", "Base").WithScrews("base_s1", "base_s2"));
            o.Par = 11;
            return o;
        }
    }
}
