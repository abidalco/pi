"""Cut the keyed A-pose into rig parts → ../<part>.png + ../char.json (pivots in each part's own pixels)."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = Path(__file__).parent
SRC = np.asarray(Image.open(HERE / "apose_key.png")).astype(np.float32)
H, W = SRC.shape[:2]
YY, XX = np.mgrid[0:H, 0:W]

# joints picked on the A-pose (source px)
J = dict(capTop=(790, 96), neck=(752, 380), pelvis=(730, 1090), shN=(656, 476), shF=(900, 490), hipN=(660, 1090), hipF=(824, 1090),
         elbow=(786, 746), wrist=(894, 966), tip=(1046, 1028), knee=(652, 1400), ankle=(626, 1760), toe=(744, 1760))
K = 100 / (2000 - 96)                        # world units per source px (head-to-sole = 100 units)


def capsule(a, b, ra, rb):
    a, b = np.array(a, float), np.array(b, float)
    d = b - a; L2 = d @ d
    t = np.clip(((XX - a[0]) * d[0] + (YY - a[1]) * d[1]) / L2, 0, 1)
    px, py = a[0] + t * d[0], a[1] + t * d[1]
    dist = np.hypot(XX - px, YY - py)
    r = ra + (rb - ra) * t
    return np.clip((r - dist) / 1.5 + .5, 0, 1)


def poly(pts):
    m = Image.new("L", (W, H), 0); ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=255)
    return np.asarray(m).astype(np.float32) / 255


def save(name, mask, img=SRC, joints=()):
    a = img.copy(); a[..., 3] *= mask
    ys, xs = np.where(a[..., 3] > 8)
    x0, y0, x1, y1 = int(xs.min()) - 2, int(ys.min()) - 2, int(xs.max()) + 3, int(ys.max()) + 3
    Image.fromarray(a[y0:y1, x0:x1].astype(np.uint8), "RGBA").save(HERE.parent / f"{name}.png")
    return {"img": f"{name}.png", **{k: [round(v[0] - x0, 1), round(v[1] - y0, 1)] for k, v in joints}}


parts = {}
# head: everything above the collar line; axis points straight up from the neck (rest pose stays as drawn)
head = poly([(640, 70), (960, 70), (960, 420), (880, 418), (800, 400), (744, 388), (680, 372), (640, 366)])
parts["head"] = save("head", head, joints=[("pivot", J["neck"]), ("to", (J["neck"][0], J["capTop"][1]))])
# torso (shirt + hips): repaint the arms and hands that lie over it with the nearest shirt colour
tp = poly([(672, 360), (600, 380), (556, 430), (544, 520), (540, 660), (552, 840), (572, 980), (552, 1040), (544, 1160), (650, 1185), (760, 1180),
           (936, 1150), (940, 1040), (944, 976), (936, 860), (944, 660), (920, 500), (896, 430), (840, 400), (764, 384)])
img = SRC.copy()
r, g, b = img[..., 0], img[..., 1], img[..., 2]
skin = (r > 120) & (r - b > 40) & (r > g + 8) & (tp > .5)
skin = ndimage.binary_dilation(skin, iterations=7) & (tp > .5)
keep = (tp > .5) & ~skin & (img[..., 3] > 200)
_, (iy, ix) = ndimage.distance_transform_edt(~keep, return_indices=True)
img[skin] = img[iy[skin], ix[skin]]
parts["torso"] = save("torso", tp, img, joints=[("pivot", J["pelvis"]), ("to", (J["pelvis"][0], J["neck"][1]))])
parts["upperArm"] = save("upperArm", capsule(J["shN"], J["elbow"], 84, 50), joints=[("pivot", J["shN"]), ("to", J["elbow"])])
parts["forearm"] = save("forearm", capsule(J["elbow"], J["wrist"], 48, 36), joints=[("pivot", J["elbow"]), ("to", J["wrist"])])
parts["hand"] = save("hand", capsule(J["wrist"], (1036, 1024), 34, 44), joints=[("pivot", J["wrist"]), ("to", J["tip"])])
parts["thigh"] = save("thigh", capsule(J["hipN"], J["knee"], 104, 86), joints=[("pivot", J["hipN"]), ("to", J["knee"])])
parts["shin"] = save("shin", capsule(J["knee"], J["ankle"], 84, 78), joints=[("pivot", J["knee"]), ("to", J["ankle"])])
parts["foot"] = save("foot", poly([(552, 1700), (640, 1690), (700, 1800), (760, 1920), (756, 2004), (556, 2004), (546, 1900)]),
                     joints=[("pivot", J["ankle"]), ("to", J["toe"])])

# skeleton proportions in world units, torso frame = pelvis → neck
P0, N0 = np.array(J["pelvis"], float), np.array(J["neck"], float)
u = (N0 - P0) / np.linalg.norm(N0 - P0); f = np.array([-u[1], u[0]])
def tf(p): v = np.array(p, float) - P0; return [round(float(v @ f) * K, 2), round(float(v @ u) * K, 2)]
L = lambda a, b: round(float(np.hypot(*(np.array(J[b], float) - J[a]))) * K, 2)
prop = dict(neck0=tf(J["neck"]), neckLen=0, shoulderN=tf(J["shN"]), shoulderF=tf(J["shF"]), hipN=tf(J["hipN"]), hipF=tf(J["hipF"]),
            ua=L("shN", "elbow"), fa=L("elbow", "wrist"), th=L("hipN", "knee"), sn=L("knee", "ankle"),
            sole=[[round((556 - 626) * K, 2), round((2000 - 1760) * K, 2)], [round((756 - 626) * K, 2), round((2000 - 1760) * K, 2)]])
json.dump({"name": "cap", "k": K, "prop": prop, "parts": parts, "faces": {}}, open(HERE.parent / "char.json", "w"), indent=1)
print(json.dumps(prop))
