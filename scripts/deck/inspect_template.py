"""Dumps every slide's shapes (type, name, position, text) from the two templates."""
import sys
from pptx import Presentation
from pptx.util import Emu

for path in sys.argv[1:]:
    prs = Presentation(path)
    print(f"===== {path}  size={Emu(prs.slide_width).inches:.2f}x{Emu(prs.slide_height).inches:.2f}in layouts={[l.name for l in prs.slide_layouts]}")
    for i, slide in enumerate(prs.slides, 1):
        print(f"--- slide {i} layout={slide.slide_layout.name}")
        for sh in slide.shapes:
            text = sh.text_frame.text.replace("\n", " | ")[:110] if sh.has_text_frame else ""
            ph = f" ph={sh.placeholder_format.idx}" if sh.is_placeholder else ""
            fill = ""
            print(f"  {sh.shape_type!s:22} {sh.name[:22]:22}{ph} x={Emu(sh.left).inches:.2f} y={Emu(sh.top).inches:.2f} w={Emu(sh.width).inches:.2f} h={Emu(sh.height).inches:.2f} :: {text}")
