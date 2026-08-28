#!/usr/bin/env python3
"""Generate Tsuji demo .tsuji graphs: shared setup nodes + per-demo subject nodes."""
import json, os, sys

ROOT = "/Users/nikos/Desktop/OpenVMap3D"
DEMOS = os.path.join(ROOT, "public/demos")

BLUE, PINK, MID = 0x38BDF8, 0xEC4899, 0x8B5CF6
CYAN, WARM = 0x06B6D4, 0xFFDC6E


def setup_blocks():
    """The shared setup's nodes+connections, re-keyed with a `setup_` prefix."""
    with open(os.path.join(DEMOS, "setup.tsuji")) as f:
        data = json.load(f)
    canvas = data["canvases"][data.get("activeCanvas", 0)]
    remap = {n["id"]: f"setup_{i}" for i, n in enumerate(canvas["nodes"])}
    nodes = [{**n, "id": remap[n["id"]]} for n in canvas["nodes"]]
    conns = [
        {**c, "id": f"setup_c{i}", "fromNode": remap[c["fromNode"]], "toNode": remap[c["toNode"]]}
        for i, c in enumerate(canvas["connections"])
    ]
    return nodes, conns


def setup_id(node_type):
    """The setup's node of this type, by its re-keyed id (post-processing wires into Render)."""
    nodes, _ = setup_blocks()
    for n in nodes:
        if n["type"] == node_type:
            return n["id"]
    raise KeyError(node_type)


RENDER = setup_id("render")


def v3(x=0.0, y=0.0, z=0.0):
    return {"x": x, "y": y, "z": z}


def node(nid, ntype, px, py, **params):
    return {"id": nid, "type": ntype, "position": {"x": px, "y": py}, "params": params}


def wire(a, sa, b, sb):
    return {"id": f"{a}.{sa}->{b}.{sb}", "fromNode": a, "fromSocket": sa, "toNode": b, "toSocket": sb}


def write_demo(name, nodes, conns, markers=None, extra_canvas=None):
    base_nodes, base_conns = setup_blocks()
    canvas = {
        "nodes": base_nodes + nodes,
        "connections": base_conns + conns,
        "keyframes": {},
        "markers": markers or [],
        "exposedParams": [],
    }
    empty = lambda: {"nodes": [], "connections": [], "keyframes": {}, "markers": [], "exposedParams": []}
    canvases = [canvas] + [empty() for _ in range(5)]
    if extra_canvas:
        canvases[1] = {**empty(), **extra_canvas}
    path = os.path.join(DEMOS, f"demo_{name}.tsuji")
    with open(path, "w") as f:
        json.dump({"canvases": canvases, "activeCanvas": 0}, f, indent=2)
        f.write("\n")
    print(f"  wrote demo_{name}.tsuji  ({len(nodes)} subject nodes)")


DEMOS_SPEC = {}


def demo(name):
    def deco(fn):
        DEMOS_SPEC[name] = fn
        return fn
    return deco


# ---------------------------------------------------------------- Objects

@demo("object_primitives")
def _():
    n = [
        node("cyl", "object/cylinder", -900, 40, location=v3(-2.2, 0.5, 0), scale=v3(0.7, 1, 0.7), color=BLUE, roughness=0.25, metalness=0.3),
        node("cone", "object/cone", -900, 240, location=v3(0, 0.5, 0), scale=v3(0.9, 1.2, 0.9), color=MID, roughness=0.25, metalness=0.3),
        node("disc", "object/disc", -900, 440, location=v3(2.2, 0.5, 0), rotation=v3(1.5708, 0, 0), radius=0.8, innerRadius=0.35, depth=0.25, color=PINK, roughness=0.2, metalness=0.4),
        node("merge", "structure/merge", -560, 240),
    ]
    c = [wire(s, "geometry", "merge", f"in{i}") for i, s in enumerate(["cyl", "cone", "disc"])]
    return n, c


@demo("object_text")
def _():
    n = [
        node("word", "text/constant", -1180, 120, text="tsuji"),
        node("upper", "text/case", -940, 120, mode="uppercase"),
        node("suffix", "text/constant", -1180, 300, text="3D"),
        node("join", "text/concat", -700, 200, separator=" "),
        node("label", "object/text", -440, 200, location=v3(-1.6, 0.3, 0), fontSize=1.1, depth=0.18, color=BLUE, emissive=BLUE, emissiveIntensity=0.35, metalness=0.4, roughness=0.2),
    ]
    c = [
        wire("word", "text", "upper", "text"),
        wire("upper", "text", "join", "textA"),
        wire("suffix", "text", "join", "textB"),
        wire("join", "text", "label", "text"),
    ]
    return n, c


@demo("object_empty_lookat")
def _():
    n = [
        node("orbit", "transform/orbit", -1080, 60, radius=2.6, speed=40, height=1.1),
        node("empty", "object/empty", -820, 60),
        node("cone", "object/cone", -1080, 300, location=v3(0, 0.6, 0), scale=v3(0.5, 1.1, 0.5), color=PINK, roughness=0.25, metalness=0.35),
        node("aim", "transform/look-at", -560, 220),
    ]
    c = [
        wire("orbit", "matrix", "empty", "matrix"),
        wire("cone", "geometry", "aim", "geometry"),
        wire("empty", "geometry", "aim", "target"),
    ]
    return n, c


# -------------------------------------------------------------- Modifiers

@demo("modifier_boolean")
def _():
    n = [
        node("box", "object/box", -900, 60, location=v3(0, 0.9, 0), scale=v3(1.6, 1.6, 1.6), color=BLUE, roughness=0.2, metalness=0.35),
        node("cut", "object/sphere", -900, 300, location=v3(0.6, 1.4, 0.6), scale=v3(1.1, 1.1, 1.1), color=PINK),
        node("bool", "modifier/boolean", -560, 160, operation="subtract"),
    ]
    c = [wire("box", "geometry", "bool", "geometry"), wire("cut", "geometry", "bool", "boolean")]
    return n, c


@demo("modifier_subdivide_shade")
def _():
    n = [
        node("ico", "object/cone", -1080, 120, location=v3(0, 0.9, 0), scale=v3(1.3, 1.6, 1.3), color=MID, roughness=0.25, metalness=0.4),
        node("sub", "modifier/subdivide", -800, 120, mode="catmull-clark", levels=2),
        node("shade", "modifier/shade", -540, 120, mode="auto", autoAngle=40),
    ]
    c = [wire("ico", "geometry", "sub", "geometry"), wire("sub", "geometry", "shade", "geometry")]
    return n, c


@demo("modifier_lattice")
def _():
    n = [
        node("ball", "object/sphere", -1000, 120, location=v3(0, 1.1, 0), scale=v3(1.2, 1.2, 1.2), color=BLUE, roughness=0.2, metalness=0.45),
        node("cage", "modifier/lattice", -660, 120, location=v3(0, 1.1, 0), sizeX=2.6, sizeY=2.6, sizeZ=2.6, twist=55, bulge=0.45, strength=1, showCage=True),
    ]
    return n, [wire("ball", "geometry", "cage", "geometry")]


@demo("modifier_clipping")
def _():
    n = [
        node("ball", "object/sphere", -1000, 120, location=v3(0, 1.1, 0), scale=v3(1.5, 1.5, 1.5), color=PINK, roughness=0.2, metalness=0.4),
        node("clip", "modifier/clip-box", -660, 120, location=v3(0, 1.1, 0), size=v3(2.2, 2.2, 1.4), clipMode="inside"),
    ]
    return n, [wire("ball", "geometry", "clip", "geometry")]


# ----------------------------------------------------------- Particles

@demo("particles_basic")
def _():
    n = [
        node("emit", "particles/emitter", -1080, 60, position=v3(0, 0.4, 0), velocity=v3(0, 3.2, 0), spawnRate=400, diameter=0.35),
        node("sim", "particles/simulate", -800, 60, gravity=3.4, lifetime=2.6, lifetimeVariance=35, count=2048),
        node("draw", "particles/render", -520, 60, size=5, color=CYAN, sprite="circle", fadeOpacity=True, fadeSize=True),
    ]
    c = [
        wire("emit", "emitter", "sim", "emitter"),
        wire("sim", "positions", "draw", "positions"),
        wire("sim", "count", "draw", "count"),
        wire("sim", "lifetime", "draw", "lifetime"),
    ]
    return n, c


@demo("particles_surface")
def _():
    n = [
        node("src", "object/sphere", -1320, 300, location=v3(0, 1.2, 0), scale=v3(1.2, 1.2, 1.2), visible=0),
        node("emit", "particles/emitter-from-surface", -1060, 300, spawnRate=300, points=400, velocity=v3(0, 0.6, 0)),
        node("pull", "particles/force-field", -1060, 60, fieldType="vortex", position=v3(0, 1.2, 0), axis=v3(0, 1, 0), strength=4, radius=6),
        node("floor", "particles/ground", -1060, 500, enabled=1, height=0, bounce=0.35, friction=0.85),
        node("sim", "particles/simulate", -760, 300, gravity=2.2, lifetime=3.2, lifetimeVariance=30, count=1024),
        node("shape", "object/box", -760, 560, scale=v3(1, 1, 1), color=PINK, emissive=PINK, emissiveIntensity=0.25, visible=0),
        node("draw", "particles/render-instances", -460, 300, instanceScale=0.07, color=PINK, roughness=0.25, metalness=0.4),
    ]
    c = [
        wire("src", "geometry", "emit", "geometry"),
        wire("emit", "emitter", "sim", "emitter"),
        wire("pull", "field", "sim", "field0"),
        wire("floor", "ground", "sim", "ground"),
        wire("sim", "positions", "draw", "positions"),
        wire("sim", "count", "draw", "count"),
        wire("sim", "lifetime", "draw", "lifetime"),
        wire("shape", "geometry", "draw", "shape"),
    ]
    return n, c


@demo("particles_trails")
def _():
    n = [
        node("emit", "particles/emitter", -1160, 60, position=v3(0, 1.4, 0), velocity=v3(0, 1.6, 0), spawnRate=90, diameter=1.1),
        node("swirl", "particles/force-field", -1160, 300, fieldType="vortex", position=v3(0, 1.2, 0), axis=v3(0, 1, 0), strength=5, radius=5),
        # 512, not the 4096 default: capture-trails and connect-nearby each
        # read the position texture back from the GPU every frame.
        node("sim", "particles/simulate", -860, 160, gravity=0.4, lifetime=4, count=512),
        node("trails", "particles/capture-trails", -560, 60, historyLength=48, color=CYAN, linewidth=1.6, fadeAlongTrail=True),
        node("web", "particles/connect-nearby", -560, 300, maxDistance=1.1, maxConnections=4, color=PINK),
    ]
    c = [
        wire("emit", "emitter", "sim", "emitter"),
        wire("swirl", "field", "sim", "field0"),
        wire("sim", "positions", "trails", "positions"),
        wire("sim", "count", "trails", "count"),
        wire("sim", "positions", "web", "positions"),
        wire("sim", "count", "web", "count"),
    ]
    return n, c


# ------------------------------------------------------------- Textures

@demo("texture_procedural")
def _():
    n = [
        node("noise", "texture/procedural", -1240, 60, type="voronoi", colorA=BLUE, colorB=PINK, scale=5, resolution=512),
        node("rings", "texture/procedural", -1240, 300, type="rings", colorA=PINK, colorB=0x101820, scale=6, resolution=512),
        node("mix", "texture/mix", -960, 160, blendMode="mix", factor=0.45),
        node("warp", "texture/transform", -700, 160, rotation=0.5, scale=v3(2, 2, 1)),
        node("bump", "texture/to_normal", -700, 380),
        node("ball", "object/sphere", -420, 160, location=v3(0, 1.2, 0), scale=v3(1.4, 1.4, 1.4), roughness=0.35, metalness=0.3),
    ]
    c = [
        wire("noise", "texture", "mix", "textureA"),
        wire("rings", "texture", "mix", "textureB"),
        wire("mix", "texture", "warp", "texture"),
        wire("mix", "texture", "bump", "texture"),
        wire("warp", "texture", "ball", "texture"),
        wire("bump", "normal", "ball", "normal"),
    ]
    return n, c


@demo("texture_to_geometry")
def _():
    n = [
        node("pattern", "texture/procedural", -1120, 120, type="rings", colorA=BLUE, colorB=PINK, scale=4, resolution=128),
        # No visible:0 here — pixel-spawner *owns* its geometry input, so it
        # clones this template; hiding it would hide every clone too.
        node("cube", "object/box", -1120, 360, scale=v3(1, 1, 1), color=BLUE, roughness=0.25, metalness=0.4),
        # instanceScale multiplies the *cell* size (gridWidth / maxResolution),
        # it is not an absolute scale — at 48px and 0.16 the cubes came out
        # 0.017 units wide and were invisible. xz lays the grid on the floor.
        node("spawner", "texture/pixel-spawner", -800, 200, density=50, gridWidth=5, gridHeight=5, orientation="xz", instanceScale=1, maxResolution=24),
    ]
    c = [
        wire("pattern", "texture", "spawner", "texture"),
        wire("cube", "geometry", "spawner", "geometry"),
    ]
    return n, c


# ------------------------------------------------------------- Dataviz

@demo("chart_bar")
def _():
    n = [
        node("vals", "list/random-list", -1200, 120, count=9, seed=7, min=0.15, max=1.0),
        node("stats", "list/statistics", -940, 320),
        node("palette", "list/color-palette", -1200, 340, count=9),
        node("bars", "object/bar_graph", -660, 120, location=v3(0, 0, 0), count=9, spacing=0.15, barWidth=0.45, barDepth=0.45, maxHeight=2.6, metalness=0.35, roughness=0.25),
        node("axis", "object/chart_axis", -660, 400, location=v3(0, 0, -0.6), min=0, max=1, step=0.25, maxHeight=2.6, width=4.6),
    ]
    c = [
        wire("vals", "list", "bars", "values"),
        wire("vals", "list", "stats", "list"),
        wire("palette", "list", "bars", "colors"),
        wire("stats", "max", "axis", "max"),
    ]
    return n, c


@demo("chart_pie")
def _():
    n = [
        node("vals", "list/random-list", -1060, 120, count=6, seed=3, min=0.2, max=1.0),
        node("palette", "list/color-palette", -1060, 340, count=6),
        node("pie", "object/pie_chart", -720, 200, location=v3(0, 0.15, 0), rotation=v3(-1.5708, 0, 0), radius=1.8, innerRadius=0.7, depth=0.3, gapDegrees=2, metalness=0.35, roughness=0.25),
    ]
    c = [wire("vals", "list", "pie", "values"), wire("palette", "list", "pie", "colors")]
    return n, c


@demo("chart_scatter")
def _():
    n = [
        node("xs", "list/random-list", -1240, 40, count=60, seed=11, min=-2.2, max=2.2),
        node("ys", "list/random-list", -1240, 220, count=60, seed=29, min=0.2, max=2.6),
        node("zs", "list/random-list", -1240, 400, count=60, seed=47, min=-2.2, max=2.2),
        node("palette", "list/color-palette", -1240, 580, count=60),
        node("cloud", "object/scatter_plot", -820, 220, markerSize=0.11, metalness=0.4, roughness=0.2),
    ]
    c = [
        wire("xs", "list", "cloud", "xValues"),
        wire("ys", "list", "cloud", "yValues"),
        wire("zs", "list", "cloud", "zValues"),
        wire("palette", "list", "cloud", "colors"),
    ]
    return n, c


@demo("chart_line")
def _():
    n = [
        node("vals", "list/random-list", -1060, 120, count=14, seed=5, min=0.1, max=1.0),
        node("palette", "list/color-palette", -1060, 340, count=14),
        node("graph", "object/line_graph", -720, 200, location=v3(0, 0, 0), count=14, spacing=0.32, maxHeight=2.4, lineWidth=0.06, showPoints=1, pointSize=0.09, smooth=1),
    ]
    c = [wire("vals", "list", "graph", "values"), wire("palette", "list", "graph", "colors")]
    return n, c


# --------------------------------------------------------------- Lists

@demo("list_basics")
def _():
    n = [
        node("seq", "list/generate", -1300, 120, count=12, start=0.2, step=0.16),
        node("cut", "list/slice", -1040, 120, start=2, count=8),
        node("len", "list/length", -1040, 340),
        node("pick", "list/get-item", -1040, 500, index=3),
        node("look", "io/inspector", -780, 420),
        node("bars", "object/bar_graph", -720, 120, count=8, spacing=0.2, barWidth=0.5, barDepth=0.5, maxHeight=2.4, color=BLUE, metalness=0.35, roughness=0.25),
    ]
    c = [
        wire("seq", "list", "cut", "list"),
        wire("seq", "list", "len", "list"),
        wire("seq", "list", "pick", "list"),
        wire("pick", "val", "look", "input"),
        wire("cut", "list", "bars", "values"),
    ]
    return n, c


@demo("list_vectors")
def _():
    n = [
        node("xs", "list/random-list", -1320, 40, count=40, seed=2, min=-2.4, max=2.4),
        node("ys", "list/random-list", -1320, 220, count=40, seed=13, min=0.3, max=2.4),
        node("zs", "list/random-list", -1320, 400, count=40, seed=23, min=-2.4, max=2.4),
        node("pack", "list/combine-vectors", -1020, 220),
        node("unpack", "list/split-vectors", -780, 220),
        node("cloud", "object/point_cloud", -520, 220, pointSize=0.12, color=PINK),
    ]
    c = [
        wire("xs", "list", "pack", "xList"),
        wire("ys", "list", "pack", "yList"),
        wire("zs", "list", "pack", "zList"),
        wire("pack", "vectorList", "unpack", "vectorList"),
        wire("unpack", "xList", "cloud", "xValues"),
        wire("unpack", "yList", "cloud", "yValues"),
        wire("unpack", "zList", "cloud", "zValues"),
    ]
    return n, c


# ---------------------------------------------------------------- Math

@demo("math_wiggle")
def _():
    n = [
        node("wig", "animation/wiggle", -1000, 60, speed=0.7, amplitudeVector=v3(1.4, 0.5, 1.4), rotationAmplitude=v3(30, 60, 30), scaleAmplitude=v3(0.2, 0.2, 0.2), seed=4),
        node("box", "object/box", -1000, 320, location=v3(0, 1.2, 0), scale=v3(0.9, 0.9, 0.9), color=BLUE, roughness=0.2, metalness=0.4),
    ]
    return n, [wire("wig", "matrix", "box", "matrix")]


@demo("math_random")
def _():
    n = [
        node("box", "object/box", -1240, 320, scale=v3(0.45, 0.45, 0.45), color=MID, roughness=0.2, metalness=0.45),
        node("row", "structure/array", -1000, 320, mode="linear", axis="X", count=9, spacing=0.75),
        node("mat", "transform/random-matrix", -1000, 80, seed=6, posRange=0.9, rotRange=180, scaleMin=0.6, scaleMax=1.5),
        node("place", "structure/instance-transform", -700, 260, mode="relative", pivot="individual", index=-1),
    ]
    c = [
        wire("box", "geometry", "row", "geometry"),
        wire("row", "geometry", "place", "geometry"),
        wire("mat", "matrix", "place", "matrices"),
    ]
    return n, c


@demo("math_ramp_color")
def _():
    n = [
        node("osc", "animation/oscillator", -1300, 120, type="sine", frequency=0.25, amplitude=1, offset=0),
        node("ramp", "value/map-range", -1040, 120, inMin=-1, inMax=1, outMin=0.15, outMax=1, clamp=1),
        node("hold", "value/clamp", -800, 120, min=0.2, max=0.95),
        node("hue", "color/compose", -800, 320),
        node("tint", "color/math", -560, 220, op="mix"),
        node("base", "color/constant", -1040, 400, color=BLUE),
        node("mat", "material/standard", -320, 220, roughness=0.2, metalness=0.4),
        node("ball", "object/sphere", -80, 220, location=v3(0, 1.2, 0), scale=v3(1.2, 1.2, 1.2)),
    ]
    c = [
        wire("osc", "out", "ramp", "value"),
        wire("ramp", "out", "hold", "value"),
        wire("hold", "out", "hue", "r"),
        wire("base", "out", "tint", "a"),
        wire("hue", "out", "tint", "b"),
        wire("hold", "out", "tint", "factor"),
        wire("tint", "out", "mat", "color"),
        wire("mat", "material", "ball", "material"),
    ]
    return n, c


@demo("math_proximity")
def _():
    n = [
        node("box", "object/box", -1300, 320, scale=v3(0.4, 0.4, 0.4), color=BLUE, roughness=0.25, metalness=0.4),
        node("grid", "structure/array", -1060, 320, mode="grid", plane="XZ", gridCols=7, gridRows=7, spacingX=0.8, spacingY=0.8, centerGrid=True),
        node("orbit", "transform/orbit", -1300, 60, radius=2.2, speed=50, height=1.4),
        node("probe", "object/sphere", -1060, 60, scale=v3(0.35, 0.35, 0.35), color=PINK, emissive=PINK, emissiveIntensity=0.6),
        node("near", "object/proximity", -760, 180, ignoreSelf=True),
        node("dists", "math/distances", -760, 420),
        node("glow", "list/distance-gradient", -520, 420, radius=2.4, power=1.5),
        node("tint", "structure/instance-color", -280, 320, index=-1),
    ]
    c = [
        wire("box", "geometry", "grid", "geometry"),
        wire("orbit", "matrix", "probe", "matrix"),
        wire("probe", "geometry", "near", "target"),
        wire("grid", "geometry", "near", "candidates"),
        wire("grid", "geometry", "dists", "instances"),
        wire("probe", "geometry", "dists", "target"),
        wire("dists", "distances", "glow", "distances"),
        wire("grid", "geometry", "tint", "geometry"),
        wire("glow", "list", "tint", "colors"),
    ]
    return n, c


# -------------------------------------------------------------- Curves

@demo("curve_follow_path")
def _():
    n = [
        node("path", "curve/primitive", -1200, 120, primitiveType="helix", radius=1.8, height=2.6, turns=3, location=v3(0, 0.4, 0)),
        node("line", "curve/to_line", -940, 320, linewidth=2.5, color=CYAN),
        node("t", "animation/oscillator", -1200, 380, type="sawtooth", frequency=0.2, amplitude=0.5, offset=0.5),
        node("rider", "curve/sample", -940, 120),
        node("cone", "object/cone", -700, 120, scale=v3(0.28, 0.5, 0.28), color=PINK, roughness=0.25, metalness=0.4),
    ]
    c = [
        wire("path", "curve", "line", "curve"),
        wire("path", "curve", "rider", "curve"),
        wire("t", "out", "rider", "progress"),
        wire("rider", "matrix", "cone", "matrix"),
    ]
    return n, c


@demo("curve_deform")
def _():
    n = [
        node("path", "curve/primitive", -1160, 120, primitiveType="wave", radius=2.4, height=1.2, turns=2, location=v3(0, 1.1, 0), visible=0),
        node("bar", "object/cylinder", -1160, 340, scale=v3(0.35, 2.4, 0.35), color=MID, roughness=0.2, metalness=0.45),
        node("bend", "curve/deform", -820, 220, axis="y", stretch=1, progress=0),
    ]
    c = [wire("bar", "geometry", "bend", "geometry"), wire("path", "curve", "bend", "curve")]
    return n, c


@demo("curve_array")
def _():
    n = [
        node("ring", "curve/primitive", -1120, 120, primitiveType="circle", radius=1.6, location=v3(0, 0.6, 0), visible=0),
        node("stack", "curve/array", -840, 120, count=9, spacing=0.22, start=0, step=0.06),
        node("lines", "curve/to_line_list", -560, 120, linewidth=2, color=BLUE),
    ]
    c = [wire("ring", "curve", "stack", "curve"), wire("stack", "curves", "lines", "curves")]
    return n, c


# ------------------------------------------------------------ Physics

@demo("physics_scatter")
def _():
    n = [
        node("host", "object/sphere", -1320, 120, location=v3(0, 1.3, 0), scale=v3(1.4, 1.4, 1.4), color=0x1c2530, roughness=0.5, metalness=0.2),
        node("pts", "physics/sample", -1060, 120, count=90, seed=8),
        node("split", "list/split-vectors", -800, 120),
        node("seed_obj", "object/cone", -1060, 400, scale=v3(0.16, 0.32, 0.16), color=PINK, roughness=0.25, metalness=0.4),
        node("scatter", "structure/spawn", -520, 200, count=90, seed=8, scaleMin=0.7, scaleMax=1.3, alignToNormal=1),
    ]
    c = [
        wire("host", "geometry", "pts", "geometry"),
        wire("pts", "points", "split", "vectorList"),
        wire("host", "geometry", "scatter", "support"),
        wire("seed_obj", "geometry", "scatter", "items"),
        wire("split", "xList", "scatter", "xValues"),
        wire("split", "yList", "scatter", "yValues"),
        wire("split", "zList", "scatter", "zValues"),
    ]
    return n, c


# ------------------------------------------------------------- Lights

@demo("lighting_lights")
def _():
    n = [
        node("ball", "object/sphere", -1180, 320, location=v3(0, 1.1, 0), scale=v3(1.1, 1.1, 1.1), color=0xdddddd, roughness=0.35, metalness=0.2),
        node("amb", "light/ambient", -1180, 60, color=BLUE, intensity=0.25),
        node("sun", "light/directional", -940, 60, color=WARM, intensity=1.6, location=v3(4, 6, 3), castShadow=1),
        node("spot", "light/spot", -700, 60, color=PINK, intensity=40, angle=32, penumbra=0.5, location=v3(-3, 4.5, 2.5), castShadow=1),
        node("orbit", "transform/orbit", -700, 320, radius=3, speed=35, height=2),
        node("moving", "light/point", -460, 320, color=CYAN, intensity=25, distance=10, decay=2),
    ]
    c = [
        wire("ball", "geometry", "spot", "target"),
        wire("orbit", "matrix", "moving", "matrix"),
    ]
    return n, c


# ------------------------------------------------------ Logic & Interaction

@demo("logic_keyboard")
def _():
    n = [
        node("key", "io/keyboard", -1280, 120, key="space"),
        node("flip", "logic/toggle", -1040, 120),
        node("osc", "animation/oscillator", -1280, 340, type="sine", frequency=0.6, amplitude=1.2, offset=1.4),
        node("gate", "logic/gate", -800, 220),
        node("ball", "object/sphere", -1040, 480, location=v3(0, 1.2, 0), scale=v3(0.8, 0.8, 0.8), color=CYAN, emissive=CYAN, emissiveIntensity=0.3, roughness=0.2, metalness=0.4),
        node("cube", "object/box", -800, 480, location=v3(0, 1.2, 0), scale=v3(1.1, 1.1, 1.1), color=PINK, roughness=0.2, metalness=0.4),
        node("pick", "logic/bridge", -520, 360),
    ]
    c = [
        wire("key", "pressed", "flip", "trigger"),
        wire("osc", "out", "gate", "value"),
        wire("flip", "out", "gate", "enable"),
        wire("flip", "out", "pick", "condition"),
        wire("ball", "geometry", "pick", "ifTrue"),
        wire("cube", "geometry", "pick", "ifFalse"),
    ]
    return n, c


@demo("logic_compare")
def _():
    n = [
        node("osc", "animation/oscillator", -1280, 120, type="sine", frequency=0.4, amplitude=1, offset=0),
        node("test", "logic/compare", -1040, 120, op=">", b=0),
        node("edge", "logic/trigger", -800, 120),
        node("env", "animation/envelope", -560, 120, attack=0.08, release=0.9),
        node("pulse", "time/pulse", -560, 340, decay=1.6),
        node("mat", "material/standard", -300, 220, color=PINK, emissive=PINK, roughness=0.2, metalness=0.4),
        node("ball", "object/sphere", -60, 220, location=v3(0, 1.2, 0), scale=v3(1, 1, 1)),
    ]
    c = [
        wire("osc", "out", "test", "a"),
        wire("test", "out", "edge", "in"),
        wire("edge", "trigger", "env", "trigger"),
        wire("edge", "trigger", "pulse", "trigger"),
        wire("env", "out", "mat", "emissiveIntensity"),
        wire("mat", "material", "ball", "material"),
    ]
    return n, c


# ------------------------------------------------------------- HUD & Time

@demo("hud_text")
def _():
    n = [
        node("clock", "time", -1180, 120),
        node("fmt", "converter/value-to-text", -940, 120, decimals=1, prefix="t = ", suffix=" s"),
        node("label", "hub/text", -700, 120, x=120, y=90, fontSize=44, scale=1, enterAnimation="fade"),
        node("ball", "object/sphere", -700, 380, location=v3(0, 1.1, 0), scale=v3(1, 1, 1), color=BLUE, roughness=0.25, metalness=0.4),
    ]
    c = [wire("clock", "seconds", "fmt", "value"), wire("fmt", "text", "label", "text")]
    return n, c


@demo("time_remap")
def _():
    n = [
        node("clock", "time", -1240, 120),
        node("frame", "time/frame", -1240, 340),
        node("loop", "time/remap", -1000, 120, inStart=0, inEnd=4, outStart=0, outEnd=360, ease="smooth", loop=1),
        node("box", "object/box", -760, 220, location=v3(0, 1.1, 0), scale=v3(1.1, 1.1, 1.1), color=MID, roughness=0.2, metalness=0.4),
        node("spin", "structure/geometry-transform", -520, 220, mode="relative"),
    ]
    c = [
        wire("clock", "seconds", "loop", "time"),
        wire("box", "geometry", "spin", "geometry"),
        wire("loop", "time", "spin", "rotY"),
    ]
    return n, c


# ---------------------------------------------------------- Post-Process

@demo("post_stylize")
def _():
    n = [
        node("ball", "object/sphere", -1180, 320, location=v3(0, 1.2, 0), scale=v3(1.3, 1.3, 1.3), color=BLUE, emissive=BLUE, emissiveIntensity=0.5, roughness=0.2, metalness=0.5),
        node("vig", "postprocess/vignette", -1180, 60, offset=1.1, darkness=1.3),
        node("shift", "postprocess/rgb-shift", -940, 60, amount=0.0022, angle=0.6),
        node("grain", "postprocess/film-grain", -700, 60, noiseIntensity=0.45, scanlinesIntensity=0.25, scanlinesCount=700),
        node("grade", "postprocess/color-correction", -460, 60, brightness=0.02, contrast=1.12, saturation=1.25),
    ]
    c = [
        wire("vig", "effect", "shift", "effect"),
        wire("shift", "effect", "grain", "effect"),
        wire("grain", "effect", "grade", "effect"),
        wire("grade", "effect", RENDER, "postprocess"),
    ]
    return n, c


@demo("post_outline")
def _():
    n = [
        node("ball", "object/sphere", -1180, 320, location=v3(0, 1.2, 0), scale=v3(1.2, 1.2, 1.2), color=0x1a2230, roughness=0.4, metalness=0.3),
        node("edge", "postprocess/outline", -880, 120, edgeColor=PINK, edgeStrength=6, edgeThickness=2),
        node("pix", "postprocess/kaleidoscope", -880, 380, sides=6, angle=0),
    ]
    c = [
        wire("ball", "geometry", "edge", "geometry"),
        wire("edge", "effect", RENDER, "postprocess"),
    ]
    return n, c


@demo("sound_reactive")
def _():
    n = [
        # enable: 0 on purpose — loading a demo must not fire a microphone
        # permission prompt. Flip Enable Mic in the panel to run it.
        node("mic", "sound/microphone", -1240, 120, enable=0, gain=1.4),
        node("fft", "sound/spectrum", -980, 120, bins=24, smoothing=0.75),
        node("peak", "sound/peak-detector", -980, 360, threshold=0.35, decay=0.85),
        node("palette", "list/color-palette", -980, 540, count=24),
        node("bars", "object/bar_graph", -640, 220, count=24, spacing=0.06, barWidth=0.16, barDepth=0.16, maxHeight=2.6, metalness=0.35, roughness=0.25),
    ]
    c = [
        wire("mic", "audio", "fft", "audio"),
        wire("fft", "volume", "peak", "volume"),
        wire("fft", "spectrum", "bars", "values"),
        wire("palette", "list", "bars", "colors"),
    ]
    return n, c


@demo("points_roundtrip")
def _():
    n = [
        # visible: 0 — mesh-to-points doesn't take ownership, so the source
        # would otherwise render on top of the rebuilt copy and z-fight.
        node("src", "object/sphere", -1300, 120, location=v3(0, 1.2, 0), scale=v3(1.3, 1.3, 1.3), visible=0),
        node("pts", "converter/mesh-to-points", -1040, 120),
        node("shake", "vector/wiggle-vector", -800, 120, speed=0.5, amplitude=v3(0.12, 0.12, 0.12), seed=3),
        node("back", "converter/points-to-mesh", -540, 120),
        node("split", "list/split-vectors", -800, 380),
        node("cloud", "object/point_cloud", -540, 380, pointSize=0.045, color=CYAN),
    ]
    c = [
        wire("src", "geometry", "pts", "geometry"),
        wire("pts", "points", "shake", "points"),
        wire("src", "geometry", "back", "geometry"),
        wire("shake", "points", "back", "points"),
        wire("shake", "points", "split", "vectorList"),
        wire("split", "xList", "cloud", "xValues"),
        wire("split", "yList", "cloud", "yValues"),
        wire("split", "zList", "cloud", "zValues"),
    ]
    return n, c


@demo("instancing_tools")
def _():
    n = [
        node("box", "object/box", -1300, 220, scale=v3(0.45, 0.45, 0.45), color=BLUE, roughness=0.25, metalness=0.4),
        node("ring", "structure/array", -1060, 220, mode="circular", radius=2.2, count=12, plane="XZ", totalAngle=360, orient=True),
        node("one", "structure/get-instance", -800, 60, index=0),
        node("spots", "structure/instance-positions", -800, 400, heightOffset=1.1),
        node("split", "list/split-vectors", -540, 400),
        node("marks", "object/point_cloud", -300, 400, pointSize=0.14, color=PINK),
    ]
    c = [
        wire("box", "geometry", "ring", "geometry"),
        # get-instance owns what it is given, so the ring itself stops being a
        # scene root — the single instance it returns is what renders, next to
        # the point cloud built from the same array's positions.
        wire("ring", "geometry", "one", "geometry"),
        wire("ring", "geometry", "spots", "geometry"),
        wire("spots", "positions", "split", "vectorList"),
        wire("split", "xList", "marks", "xValues"),
        wire("split", "yList", "marks", "yValues"),
        wire("split", "zList", "marks", "zValues"),
    ]
    return n, c


def main(only=None):
    names = [only] if only else list(DEMOS_SPEC)
    for name in names:
        nodes, conns = DEMOS_SPEC[name]()
        write_demo(name, nodes, conns)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
