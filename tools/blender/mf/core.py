"""Core geometry helpers for the procedural Malfoid build.

Character space convention used everywhere through V(x, fwd, z):
  x   : character's left is +x
  fwd : towards the character's front
  z   : up, metres, ground at 0
Blender space is (x, -fwd, z) so the model faces -Y (Blender front view) and
ends up facing +Z in glTF / Three.js.
"""
import math
from math import sin, cos, pi
import bpy
from mathutils import Vector


def V(x, fwd, z):
    return Vector((x, -fwd, z))


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def smoothstep(e0, e1, x):
    if e0 == e1:
        return 0.0 if x < e0 else 1.0
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)


def spow(v, e):
    """signed power"""
    return math.copysign(abs(v) ** e, v)


class Prof:
    """Monotone cubic (PCHIP) profile through keys [(t, v0, v1, ...)]."""

    def __init__(self, keys):
        keys = sorted(keys)
        self.t = [k[0] for k in keys]
        self.n = len(keys[0]) - 1
        self.v = [[k[i + 1] for k in keys] for i in range(self.n)]
        self.m = [self._tangents(v) for v in self.v]

    def _tangents(self, y):
        t = self.t
        n = len(t)
        if n == 1:
            return [0.0]
        d = [(y[i + 1] - y[i]) / (t[i + 1] - t[i]) for i in range(n - 1)]
        m = [0.0] * n
        m[0] = d[0]
        m[-1] = d[-1]
        for i in range(1, n - 1):
            if d[i - 1] * d[i] <= 0:
                m[i] = 0.0
            else:
                w1 = 2 * (t[i + 1] - t[i]) + (t[i] - t[i - 1])
                w2 = (t[i + 1] - t[i]) + 2 * (t[i] - t[i - 1])
                m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
        return m

    def __call__(self, x):
        t = self.t
        if x <= t[0]:
            return self._ret([v[0] for v in self.v])
        if x >= t[-1]:
            return self._ret([v[-1] for v in self.v])
        lo, hi = 0, len(t) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if t[mid] <= x:
                lo = mid
            else:
                hi = mid
        h = t[hi] - t[lo]
        s = (x - t[lo]) / h
        h00 = 2 * s ** 3 - 3 * s ** 2 + 1
        h10 = s ** 3 - 2 * s ** 2 + s
        h01 = -2 * s ** 3 + 3 * s ** 2
        h11 = s ** 3 - s ** 2
        out = [h00 * v[lo] + h10 * h * m[lo] + h01 * v[hi] + h11 * h * m[hi]
               for v, m in zip(self.v, self.m)]
        return self._ret(out)

    def _ret(self, o):
        return o[0] if self.n == 1 else tuple(o)


def swap_side(name):
    if name.endswith('_L'):
        return name[:-2] + '_R'
    if name.endswith('_R'):
        return name[:-2] + '_L'
    if '_L_' in name:
        return name.replace('_L_', '_R_')
    if '_R_' in name:
        return name.replace('_R_', '_L_')
    return name


class Part:
    """A mesh under construction: verts, per-corner UVs, per-face material,
    per-vertex skin weights / colours and named shape-key deltas."""

    def __init__(self):
        self.v = []
        self.w = []
        self.col = []
        self.f = []
        self.fuv = []
        self.fm = []
        self.shapes = {}

    # -- construction -----------------------------------------------------
    def vert(self, co, w=None, col=None):
        self.v.append(Vector(co))
        self.w.append(w)
        self.col.append(col)
        return len(self.v) - 1

    def face(self, idx, mat, uvs=None):
        self.f.append(tuple(idx))
        self.fm.append(mat)
        self.fuv.append(list(uvs) if uvs else [(0.0, 0.0)] * len(idx))
        return len(self.f) - 1

    def _fnormal(self, fi):
        f = self.f[fi]
        p = [self.v[i] for i in f]
        if len(p) == 3:
            return (p[1] - p[0]).cross(p[2] - p[0])
        return (p[2] - p[0]).cross(p[3] - p[1])

    def _fcenter(self, fi):
        f = self.f[fi]
        c = Vector((0, 0, 0))
        for i in f:
            c += self.v[i]
        return c / len(f)

    def flip_faces(self, f0, f1=None):
        f1 = len(self.f) if f1 is None else f1
        for fi in range(f0, f1):
            self.f[fi] = tuple(reversed(self.f[fi]))
            self.fuv[fi] = list(reversed(self.fuv[fi]))

    def orient(self, f0, refs=None, inside=None, outward=None, flip=None):
        """Make faces f0.. point away from `inside` (point), per-face `refs`
        or along `outward` (direction)."""
        if flip is not None:
            if flip:
                self.flip_faces(f0)
            return
        if len(self.f) == f0:
            return
        if refs is None and inside is None and outward is None:
            c = Vector((0, 0, 0))
            ids = set(i for fi in range(f0, len(self.f)) for i in self.f[fi])
            for i in ids:
                c += self.v[i]
            inside = c / len(ids)
        score = 0.0
        for k, fi in enumerate(range(f0, len(self.f))):
            n = self._fnormal(fi)
            if outward is not None:
                score += n.dot(outward)
            else:
                ref = refs[k] if refs is not None else inside
                score += n.dot(self._fcenter(fi) - ref)
        if score < 0:
            self.flip_faces(f0)

    def grid(self, rows, mat, closed=False, centers=None, inside=None,
             outward=None, flip=None, uv=(0.0, 1.0, 0.0, 1.0), col=None,
             cap_start=None, cap_end=None, loop=False):
        """Quad grid through `rows` (each a list of points, same length).
        closed wraps the columns. cap_start/cap_end: pole points closing the
        first/last ring with a triangle fan. Returns the vertex index grid."""
        n = len(rows[0])
        m = len(rows)
        idx = [[self.vert(p, col=col) for p in row] for row in rows]
        f0 = len(self.f)
        refs = []
        u0, u1, v0, v1 = uv
        nc = n if closed else n - 1
        mr = m if loop else m - 1
        for i in range(mr):
            i2 = (i + 1) % m
            for j in range(nc):
                j2 = (j + 1) % n
                ua = lerp(u0, u1, j / nc)
                ub = lerp(u0, u1, (j + 1) / nc)
                va = lerp(v0, v1, i / mr)
                vb = lerp(v0, v1, (i + 1) / mr)
                self.face((idx[i][j], idx[i][j2], idx[i2][j2], idx[i2][j]), mat,
                          [(ua, va), (ub, va), (ub, vb), (ua, vb)])
                if centers is not None:
                    refs.append((centers[i] + centers[i2]) * 0.5)
        for cap, ring, vv, ci in ((cap_start, idx[0], v0, 0), (cap_end, idx[-1], v1, -1)):
            if cap is None:
                continue
            pi_ = self.vert(cap, col=col)
            for j in range(nc):
                j2 = (j + 1) % n
                self.face((ring[j], ring[j2], pi_), mat,
                          [(lerp(u0, u1, j / nc), vv), (lerp(u0, u1, (j + 1) / nc), vv),
                           (lerp(u0, u1, (j + 0.5) / nc), vv)])
                if centers is not None:
                    # push the reference well inside the tube for the cap
                    inner = centers[1] if ci == 0 else centers[-2]
                    refs.append(inner)
        # caps need per-face flipping relative to the body, handle separately
        nbody = mr * nc
        self._orient_range(f0, f0 + nbody, refs[:nbody] if centers is not None else None,
                           inside, outward, flip)
        k = f0 + nbody
        for cap in (cap_start, cap_end):
            if cap is None:
                continue
            self._orient_range(k, k + nc, refs[k - f0:k - f0 + nc] if centers is not None else None,
                               inside, outward, None)
            k += nc
        return idx

    def _orient_range(self, f0, f1, refs, inside, outward, flip):
        if f1 <= f0:
            return
        if flip is not None:
            if flip:
                self.flip_faces(f0, f1)
            return
        if refs is None and inside is None and outward is None:
            c = Vector((0, 0, 0))
            ids = set(i for fi in range(f0, f1) for i in self.f[fi])
            for i in ids:
                c += self.v[i]
            inside = c / len(ids)
        score = 0.0
        for k, fi in enumerate(range(f0, f1)):
            n = self._fnormal(fi)
            if outward is not None:
                score += n.dot(outward)
            else:
                ref = refs[k] if refs is not None else inside
                score += n.dot(self._fcenter(fi) - ref)
        if score < 0:
            self.flip_faces(f0, f1)

    # -- attributes -------------------------------------------------------
    def weight(self, fn, start=0, end=None):
        end = len(self.v) if end is None else end
        for i in range(start, end):
            if self.w[i] is None:
                self.w[i] = fn(self.v[i])
        return self

    def rigid(self, bone, start=0, end=None):
        return self.weight(lambda p: {bone: 1.0}, start, end)

    def color(self, fn, start=0, end=None):
        end = len(self.v) if end is None else end
        for i in range(start, end):
            self.col[i] = fn(self.v[i])
        return self

    def shape(self, name, vi, delta):
        d = self.shapes.setdefault(name, {})
        d[vi] = d.get(vi, Vector((0, 0, 0))) + Vector(delta)

    def transform(self, fn, start=0, end=None):
        end = len(self.v) if end is None else end
        for i in range(start, end):
            self.v[i] = Vector(fn(self.v[i]))
        return self

    def scale_about(self, pivot, k):
        """k: scalar or per-axis Vector"""
        if not isinstance(k, Vector):
            k = Vector((k, k, k))
        self.v = [pivot + Vector(((v.x - pivot.x) * k.x, (v.y - pivot.y) * k.y, (v.z - pivot.z) * k.z))
                  for v in self.v]
        for d in self.shapes.values():
            for vi in d:
                d[vi] = Vector((d[vi].x * k.x, d[vi].y * k.y, d[vi].z * k.z))
        return self

    def solidify(self, th, inner_mat=None, rim_mat=None):
        """Give an open shell real thickness: an inner copy offset against
        the normals plus rim faces along every boundary edge."""
        nv = len(self.v)
        nf = len(self.f)
        normals = [Vector((0.0, 0.0, 0.0)) for _ in range(nv)]
        edges = {}
        for fi in range(nf):
            f = self.f[fi]
            n = self._fnormal(fi)
            for k, i in enumerate(f):
                normals[i] += n
                a, b = i, f[(k + 1) % len(f)]
                key = (min(a, b), max(a, b))
                edges[key] = edges.get(key, 0) + 1
        inner = []
        for i in range(nv):
            n = normals[i].normalized() if normals[i].length > 0 else Vector((0, 0, 0))
            t = th(self.v[i]) if callable(th) else th
            inner.append(self.vert(self.v[i] - n * t, w=dict(self.w[i]) if self.w[i] else None,
                                   col=self.col[i]))
        for name, d in self.shapes.items():
            for vi in list(d.keys()):
                if vi < nv:
                    d[inner[vi]] = d[vi].copy()
        for fi in range(nf):
            f = self.f[fi]
            self.face(tuple(inner[i] for i in reversed(f)), inner_mat or self.fm[fi],
                      list(reversed(self.fuv[fi])))
        for fi in range(nf):
            f = self.f[fi]
            for k in range(len(f)):
                a, b = f[k], f[(k + 1) % len(f)]
                if edges[(min(a, b), max(a, b))] == 1:
                    self.face((b, a, inner[a], inner[b]), rim_mat or self.fm[fi])
        return self

    # -- combination ------------------------------------------------------
    def merge(self, other):
        o = len(self.v)
        self.v += [x.copy() for x in other.v]
        self.w += [dict(x) if x else x for x in other.w]
        self.col += list(other.col)
        self.f += [tuple(i + o for i in f) for f in other.f]
        self.fuv += [list(u) for u in other.fuv]
        self.fm += list(other.fm)
        for name, d in other.shapes.items():
            dd = self.shapes.setdefault(name, {})
            for vi, dv in d.items():
                dd[vi + o] = dv.copy()
        return self

    def mirrored(self):
        p = Part()
        p.v = [Vector((-v.x, v.y, v.z)) for v in self.v]
        p.w = [({swap_side(b): x for b, x in w.items()} if w else w) for w in self.w]
        p.col = list(self.col)
        p.f = [tuple(reversed(f)) for f in self.f]
        p.fuv = [list(reversed(u)) for u in self.fuv]
        p.fm = list(self.fm)
        for name, d in self.shapes.items():
            p.shapes[name] = {vi: Vector((-dv.x, dv.y, dv.z)) for vi, dv in d.items()}
        return p

    # -- Blender ----------------------------------------------------------
    def to_object(self, name, mats, smooth_angle=None):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in self.v], [], self.f)
        names = []
        for m in self.fm:
            if m not in names:
                names.append(m)
        for n in names:
            me.materials.append(mats[n])
        mi = {n: i for i, n in enumerate(names)}
        uvl = me.uv_layers.new(name='UVMap')
        for p, m, uvs in zip(me.polygons, self.fm, self.fuv):
            p.material_index = mi[m]
            p.use_smooth = True
            for k, li in enumerate(p.loop_indices):
                uvl.data[li].uv = uvs[k]
        if any(c is not None for c in self.col):
            cl = me.vertex_colors.new(name='Col')
            for l in me.loops:
                c = self.col[l.vertex_index]
                c = c if c is not None else (1.0, 1.0, 1.0)
                cl.data[l.index].color = (c[0], c[1], c[2], 1.0)
        me.update()
        me.validate()
        if smooth_angle is not None:
            me.use_auto_smooth = True
            me.auto_smooth_angle = math.radians(smooth_angle)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        groups = {}
        for i, w in enumerate(self.w):
            if not w:
                raise RuntimeError('%s: vertex %d has no skin weight' % (name, i))
            items = sorted(w.items(), key=lambda kv: -kv[1])[:4]
            tot = sum(x for _, x in items)
            for b, x in items:
                if x / tot < 1e-4:
                    continue
                g = groups.get(b)
                if g is None:
                    g = groups[b] = ob.vertex_groups.new(name=b)
                g.add([i], x / tot, 'REPLACE')
        if self.shapes:
            ob.shape_key_add(name='Basis')
            for sname, d in self.shapes.items():
                kb = ob.shape_key_add(name=sname)
                for vi, dv in d.items():
                    kb.data[vi].co = self.v[vi] + dv
        return ob


# -- ring helpers -----------------------------------------------------------

def ring(center, ax_u, ax_v, ru, rv, n, e=2.0, phase=0.0, rv_neg=None):
    """Superellipse ring around center in the plane (ax_u, ax_v).
    rv_neg lets the -v half use a different radius."""
    pts = []
    for j in range(n):
        a = 2 * pi * j / n + phase
        cu = spow(cos(a), 2.0 / e)
        sv = spow(sin(a), 2.0 / e)
        r_v = rv if (sv >= 0 or rv_neg is None) else rv_neg
        pts.append(center + ax_u * (ru * cu) + ax_v * (r_v * sv))
    return pts


def frames(path, up_hint):
    """Tangent / normal / binormal frames along a polyline (parallel-ish,
    normals kept close to up_hint which may be a vector or list)."""
    n = len(path)
    out = []
    for i in range(n):
        a = path[max(i - 1, 0)]
        b = path[min(i + 1, n - 1)]
        t = (b - a).normalized()
        h = up_hint[i] if isinstance(up_hint, (list, tuple)) else up_hint
        nrm = h - t * h.dot(t)
        if nrm.length < 1e-6:
            nrm = t.orthogonal()
        nrm.normalize()
        out.append((t, nrm, t.cross(nrm).normalized()))
    return out


def chain_w(x, stops, widths=0.06):
    """1D blend along ascending `stops` [(bone, start)], smooth transitions
    of given width centred on each start. Returns {bone: w}."""
    out = {}
    n = len(stops)
    for i, (b, s) in enumerate(stops):
        wi = widths[i] if isinstance(widths, (list, tuple)) else widths
        lo = 1.0 if i == 0 else smoothstep(s - wi / 2, s + wi / 2, x)
        if i + 1 < n:
            wn = widths[i + 1] if isinstance(widths, (list, tuple)) else widths
            hi = smoothstep(stops[i + 1][1] - wn / 2, stops[i + 1][1] + wn / 2, x)
        else:
            hi = 0.0
        v = lo * (1.0 - hi)
        if v > 1e-4:
            out[b] = out.get(b, 0.0) + v
    return out


def mix_w(a, b, t):
    """blend two weight dicts"""
    out = {}
    for k, v in a.items():
        if v * (1 - t) > 1e-5:
            out[k] = v * (1 - t)
    for k, v in b.items():
        if v * t > 1e-5:
            out[k] = out.get(k, 0.0) + v * t
    return out
