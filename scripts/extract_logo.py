from PIL import Image
from pathlib import Path

src = Path(r"C:\Users\johnf\.cursor\projects\c-Users-johnf-John-13-7-2-26\assets\c__Users_johnf_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_Screenshot_2026-07-15_124736-7727e852-91f9-4f1f-80c3-6e76bad80700.png")
out_dir = Path(r"C:\Users\johnf\John-13-7-2-26\assets")
im = Image.open(src).convert("RGBA")

# Tighter crops around the wordmarks only
light = im.crop((28, 35, 340, 130))
dark = im.crop((28, 195, 340, 290))

def is_goldish(r, g, b):
    # Keep metallic gold / champagne pixels
    return (r > 120 and g > 80 and b < 160 and r >= g >= b - 20) or (r > 160 and g > 120 and b < 180)

def knock(img, mode):
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if is_goldish(r, g, b):
                continue
            # Non-gold → transparent
            px[x, y] = (0, 0, 0, 0)
    return img

def trim_alpha(img, pad=6):
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(img.width, r + pad); b = min(img.height, b + pad)
    return img.crop((l, t, r, b))

light_t = trim_alpha(knock(light.copy(), "light"))
dark_t = trim_alpha(knock(dark.copy(), "dark"))
light_t.save(out_dir / "logo-wordmark-light.png")
dark_t.save(out_dir / "logo-wordmark-dark.png")
# Shared transparent gold wordmark (prefer dark extraction — usually cleaner)
dark_t.save(out_dir / "logo-wordmark.png")
print("light", light_t.size, "corner", light_t.getpixel((0,0)))
print("dark", dark_t.size, "corner", dark_t.getpixel((0,0)))
