"""Builds the Health-a-thon final deck and two-page brief from the official templates.
Usage: .venv/Scripts/python.exe scripts/deck/build_deck.py   (run after capture-screens + frame-screens)
Outputs docs/submission/DiabeatIT-Final-Submission.pptx and DiabeatIT-Solution-Brief.pptx. Templates are never modified.
"""
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs' / 'submission'
SHOTS, FRAMED = ROOT / 'artifacts' / 'screens', ROOT / 'artifacts' / 'framed'
BLUE, GREEN, INK, GREY = RGBColor(0x1F, 0x3D, 0xA9), RGBColor(0x0D, 0x87, 0x43), RGBColor(0x23, 0x2F, 0x3E), RGBColor(0x5D, 0x6A, 0x79)
LINE, SOFT, AMBER = RGBColor(0xD9, 0xDE, 0xE7), RGBColor(0xF3, 0xF5, 0xF9), RGBColor(0xB4, 0x5A, 0x00)
FONT = 'Arial'

TEAM, CODE = '[Team name]', '[Team code]'
MVP, REPO = 'https://diabeatit.onrender.com', 'https://github.com/AbhayBhandarkar/DiabeatIt'
DEMO = 'https://diabeatit.onrender.com/demo/DiabeatIT-demo.webm'


def text(slide, x, y, w, h, paras, size=14, color=INK, anchor=MSO_ANCHOR.TOP, align=PP_ALIGN.LEFT, spacing=4):
    """paras: list of str or (str, dict(size,bold,color,italic)) or list of runs [(str, dict)]."""
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame; tf.word_wrap = True; tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.04); tf.margin_top = tf.margin_bottom = Inches(0.02)
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = align; para.space_after = Pt(spacing)
        runs = p if isinstance(p, list) else [p if isinstance(p, tuple) else (p, {})]
        for t, st in runs:
            r = para.add_run(); r.text = t; f = r.font
            f.name = FONT; f.size = Pt(st.get('size', size)); f.bold = st.get('bold', False); f.italic = st.get('italic', False)
            f.color.rgb = st.get('color', color)
    return box


def card(slide, x, y, w, h, fill=SOFT, line=LINE, radius=True):
    s = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    if radius: s.adjustments[0] = 0.06
    s.fill.solid(); s.fill.fore_color.rgb = fill
    if line is None: s.line.fill.background()
    else: s.line.color.rgb = line; s.line.width = Pt(0.75)
    s.shadow.inherit = False
    return s


def bar(slide, x, y, w, h, color):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    s.fill.solid(); s.fill.fore_color.rgb = color; s.line.fill.background(); s.shadow.inherit = False
    return s


def table(slide, x, y, w, rows, widths, size=11, head=BLUE, row_h=0.32, first_col_bold=True):
    shape = slide.shapes.add_table(len(rows), len(rows[0]), Inches(x), Inches(y), Inches(w), Inches(row_h * len(rows)))
    tbl = shape.table
    for i, wd in enumerate(widths): tbl.columns[i].width = Inches(wd)
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            cell = tbl.cell(r, c); cell.margin_left = cell.margin_right = Inches(0.06); cell.margin_top = cell.margin_bottom = Inches(0.03)
            cell.fill.solid(); cell.fill.fore_color.rgb = head if r == 0 else (RGBColor(0xFF, 0xFF, 0xFF) if r % 2 else SOFT)
            tf = cell.text_frame; tf.word_wrap = True
            para = tf.paragraphs[0]; para.text = ''
            run = para.add_run(); run.text = str(val)
            run.font.name = FONT; run.font.size = Pt(size); run.font.bold = r == 0 or (first_col_bold and c == 0 and r > 0 and len(row) > 2)
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF) if r == 0 else INK
    return tbl


def picture(slide, path, x, y, h=None, w=None):
    p = Path(path)
    if not p.exists(): raise FileNotFoundError(p)
    return slide.shapes.add_picture(str(p), Inches(x), Inches(y), height=Inches(h) if h else None, width=Inches(w) if w else None)


def picture_fit(slide, path, x, y, w, h):
    """Places an image in a box, cropping the bottom (or sides) so it never overflows."""
    pic = picture(slide, path, x, y, w=w)
    box_ratio, img_ratio = w / h, pic.width / pic.height
    if img_ratio < box_ratio: pic.crop_bottom = 1 - img_ratio / box_ratio
    else: excess = (1 - box_ratio / img_ratio) / 2; pic.crop_left = pic.crop_right = excess
    pic.left, pic.top, pic.width, pic.height = Inches(x), Inches(y), Inches(w), Inches(h)
    pic.line.color.rgb = LINE; pic.line.width = Pt(0.75)
    return pic


def remove(slide, *names):
    for sh in list(slide.shapes):
        if sh.name in names: sh._element.getparent().remove(sh._element)


def set_text(shape, value, **st):
    para = shape.text_frame.paragraphs[0]; runs = para.runs
    runs[0].text = value
    for r in runs[1:]: r.text = ''
    for k, v in st.items(): setattr(runs[0].font, k, v)
    for extra in shape.text_frame.paragraphs[1:]:
        extra._p.getparent().remove(extra._p)


def body_shape(slide):
    """The template's instruction text box (largest box below the title)."""
    boxes = [s for s in slide.shapes if s.has_text_frame and s.top > Inches(1.5) and s.top < Inches(6.9)]
    return boxes


def heading(slide, title):
    for sh in slide.shapes:
        if sh.has_text_frame and sh.top < Inches(0.5) and sh.width > Inches(5):
            set_text(sh, title)
            return sh


def bullets(slide, x, y, w, h, items, size=13, gap=5, marker='•'):
    paras = []
    for it in items:
        if isinstance(it, tuple):
            head, rest = it
            paras.append([(f'{marker} ', {'color': BLUE, 'bold': True, 'size': size}), (head, {'bold': True, 'size': size}), (f' {rest}', {'size': size})])
        else:
            paras.append([(f'{marker} ', {'color': BLUE, 'bold': True, 'size': size}), (it, {'size': size})])
    return text(slide, x, y, w, h, paras, spacing=gap)


def label(slide, x, y, w, value, color=BLUE, size=12):
    return text(slide, x, y, w, 0.3, [(value, {'bold': True, 'color': color, 'size': size})])


def build_deck():
    prs = Presentation(str(ROOT / 'PPT_Final_Teamplate_Health-a-thon 2026.pptx'))
    s = prs.slides

    # 1. Title
    sl = s[0]
    for sh in sl.shapes:
        if not sh.has_text_frame: continue
        t = sh.text_frame.text
        if t.startswith('[Solution Name]'): set_text(sh, 'DiabeatIT')
        elif t.startswith('[Short subtitle'): set_text(sh, 'One calm place for medicines, readings, doctor visits and family — AI drafts, the patient confirms')
        elif t.startswith('TEAM NAME'): set_text(sh, f'TEAM NAME  {TEAM}')
        elif t.startswith('TEAM CODE'): set_text(sh, f'TEAM CODE  {CODE}')
    text(sl, 2.2, 4.75, 8.95, 0.4, [[('Live MVP  ', {'bold': True, 'color': BLUE, 'size': 12}), (MVP, {'size': 12, 'color': GREY}), ('     Code  ', {'bold': True, 'color': BLUE, 'size': 12}), (REPO.replace('https://', ''), {'size': 12, 'color': GREY})]], align=PP_ALIGN.CENTER)

    # 2. Team
    sl = s[1]; remove(sl, *[b.name for b in body_shape(sl)])
    table(sl, 0.55, 1.25, 12.2, [
        ['Member', 'Role in DiabeatIT', 'Relevant expertise', 'Contribution'],
        ['Abhay Bhandarkar', 'Product lead · full-stack and AI engineering', 'Software engineering, applied ML, HCI', 'Architecture, web app, API, AI layer, deployment, evaluation'],
        ['[Team member]', 'On-device AI', 'Small vision + text models on phones', 'Phone-side models plugged into the AI adapter (same prompts + checks)'],
        ['[Doctor partner, specialty]', 'Clinical advisor', '[Years in practice / setting]', 'Workflow review, safety boundaries, content review, pilot site'],
        ['[Team member]', '[Role]', '[Expertise]', '[Contribution]'],
    ], [2.4, 3.0, 3.0, 3.8], size=12, row_h=0.5)
    card(sl, 0.55, 4.25, 5.95, 2.1)
    label(sl, 0.75, 4.38, 5.6, 'Why this team')
    bullets(sl, 0.75, 4.75, 5.6, 2.0, ['Built and shipped a working, deployed product — not a mock-up', 'Engineering + clinical input in one loop: every AI output is checked against a fixed schema', 'Designed with and for families who manage a parent’s diabetes'], size=12)
    card(sl, 6.75, 4.25, 6.0, 2.1)
    label(sl, 6.95, 4.38, 5.6, 'Organisation')
    text(sl, 6.95, 4.75, 5.6, 2.0, ['[Organisation / college / startup name and one line about it]', ('Fields in [brackets] are for the team to complete before submission.', {'italic': True, 'color': AMBER, 'size': 11})], size=12)

    # 3. Problem
    sl = s[2]; remove(sl, *[b.name for b in body_shape(sl)])
    stats = [('101 million', 'people in India live with diabetes, and 136 million more have prediabetes', 'ICMR–INDIAB, Lancet Diabetes & Endocrinology, 2023'),
             ('~50%', 'average adherence to long-term therapies for chronic disease', 'WHO, Adherence to Long-Term Therapies, 2003'),
             ('~2 min', 'average primary-care consultation in India — little time to reconstruct history', 'Irving et al., BMJ Open, 2017')]
    for i, (big, line, src) in enumerate(stats):
        x = 0.55 + i * 4.12
        card(sl, x, 1.2, 3.95, 1.95)
        text(sl, x + 0.2, 1.3, 3.6, 0.6, [(big, {'size': 28, 'bold': True, 'color': BLUE})])
        text(sl, x + 0.2, 1.9, 3.6, 0.8, [line], size=12)
        text(sl, x + 0.2, 2.75, 3.6, 0.3, [(src, {'size': 9, 'color': GREY, 'italic': True})])
    label(sl, 0.55, 3.4, 12, 'The gap we address', size=14)
    bullets(sl, 0.55, 3.8, 6.1, 3.2, [
        ('Fragmented care.', 'Older adults see a diabetologist, a cardiologist and a GP; each writes a separate paper prescription.'),
        ('Hidden duplicates.', 'Two products can share an ingredient (e.g. paracetamol in a cold tablet and in Dolo 650) without anyone noticing.'),
        ('Lost history.', 'Readings, missed doses and symptoms live on scraps of paper, so visits start from memory.'),
    ], size=12)
    bullets(sl, 6.85, 3.8, 5.95, 3.2, [
        ('Misinformation.', '“Karela juice can replace tablets” travels faster than guidance from the doctor.'),
        ('Family carers lack access.', 'Children help from another city with no safe, permissioned view.'),
        ('Existing apps log numbers', 'but do not connect prescriptions, visits and family into one story a doctor can use.'),
    ], size=12)
    card(sl, 0.55, 5.35, 12.2, 1.55, fill=RGBColor(0xEE, 0xF2, 0xFC), line=None)
    bar(sl, 0.55, 5.35, 0.08, 1.55, GREEN)
    text(sl, 0.85, 5.43, 11.7, 1.4, [('A real-world example DiabeatIT catches', {'bold': True, 'color': BLUE, 'size': 13}),
                                     ('A GP prescribes Dolo 650 (paracetamol 650 mg) for knee pain. Days later the patient buys a cold-and-flu tablet that also contains paracetamol. Nothing on either strip warns her. DiabeatIT flags the shared ingredient on her Medicines page and in her doctor’s view, with the official label one tap away.', {'size': 12})])

    # 4. Target users
    sl = s[3]; remove(sl, *[b.name for b in body_shape(sl)])
    cols = [('Patient · primary user', 'Sunita, 58, Pune — type 2 diabetes, hypertension, six medicines from three doctors. Uses a phone for WhatsApp and UPI.',
             ['Sees the next dose and records it in one tap', 'Scans a new prescription instead of typing it', 'Checks a forwarded health claim before acting on it']),
            ('Family carer', 'Priya, 31, Bengaluru — manages her mother’s refills and appointments remotely.',
             ['Gets only the record types Sunita shares', 'Can log doses or questions if allowed', 'Every action is in Sunita’s audit history']),
            ('Doctor', 'Dr Mehta, diabetologist, outpatient clinic — sees 40+ patients a day.',
             ['Scans the patient’s QR, no account needed', 'Reads a cited 30-second briefing and trends', 'Link expires; the patient can withdraw it'])]
    for i, (role, who, does) in enumerate(cols):
        x = 0.55 + i * 4.12
        card(sl, x, 1.2, 3.95, 3.0)
        text(sl, x + 0.2, 1.3, 3.6, 0.35, [(role, {'bold': True, 'color': BLUE, 'size': 14})])
        text(sl, x + 0.2, 1.72, 3.6, 0.9, [(who, {'size': 12, 'color': INK})])
        bullets(sl, x + 0.2, 2.65, 3.6, 1.5, does, size=12)
    card(sl, 0.55, 4.35, 12.2, 0.95, fill=RGBColor(0xEE, 0xF2, 0xFC), line=None)
    text(sl, 0.75, 4.42, 11.8, 0.85, [[('Setting  ', {'bold': True, 'color': BLUE}), ('Home (daily routine on the phone) and the outpatient visit (doctor view on any screen).', {})],
                                     [('Use case  ', {'bold': True, 'color': BLUE}), ('Keep a multi-doctor medicine routine safe and visible, and turn months of records into a one-minute, source-linked visit briefing.', {})]], size=12.5)
    steps = ['Photo of the\nprescription', 'Patient confirms\nthe schedule', 'One-tap dose\nrecords at home', 'Timeline + QR\nshared with doctor', 'Cited briefing\nat the visit']
    for i, st in enumerate(steps):
        x = 0.55 + i * 2.48
        card(sl, x, 5.55, 2.1, 1.25, fill=BLUE if i == 4 else RGBColor(0xFF, 0xFF, 0xFF), line=BLUE)
        text(sl, x + 0.05, 5.6, 2.0, 1.15, [(f'{i + 1}', {'bold': True, 'size': 16, 'color': RGBColor(0xFF, 0xFF, 0xFF) if i == 4 else GREEN}), (st, {'size': 11.5, 'bold': True, 'color': RGBColor(0xFF, 0xFF, 0xFF) if i == 4 else INK})], align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, spacing=1)
        if i < 4: text(sl, x + 2.1, 5.9, 0.38, 0.5, [('→', {'size': 20, 'bold': True, 'color': BLUE})], align=PP_ALIGN.CENTER)

    # 5. Solution
    sl = s[4]; heading(sl, 'Solution Overview, Key Features & Impact'); remove(sl, *[b.name for b in body_shape(sl)])
    feats = [('Prescription scan', 'photo → AI reads names, strengths, timings → patient confirms each line → daily schedule'),
             ('Next-dose home', 'today’s doses in India time; taken / missed / unsure recorded honestly'),
             ('Care timeline', 'visits, lab results, medicine changes, glucose, symptoms on one line'),
             ('Doctor link', 'QR, read-only, 1–30 days, revocable, each view logged; AI briefing with citations'),
             ('Ingredient overlap', 'flags the same ingredient in two products, with official label text'),
             ('Myth check + lessons', 'claims checked only against NIDDK / NCCIH / MedlinePlus cards; narrated videos'),
             ('Family circle', 'per-record read/write permissions for carers'),
             ('Phone-as-key sign-in', 'scan a QR on a shared PC and tap the matching number')]
    bullets(sl, 0.55, 1.25, 5.75, 4.5, feats, size=11.5, gap=3)
    for i, name in enumerate(['phone-light-today', 'phone-light-rx-result', 'phone-light-timeline-summary']):
        picture(sl, FRAMED / f'{name}.png', 6.45 + i * 2.18, 1.1, h=4.4)
    for i, cap in enumerate(['Next dose', 'Scanned prescription', 'Cited AI summary']):
        text(sl, 6.45 + i * 2.18, 5.52, 2.12, 0.3, [(cap, {'size': 10, 'color': GREY, 'bold': True})], align=PP_ALIGN.CENTER)
    card(sl, 0.55, 5.95, 12.2, 0.85, fill=RGBColor(0xEE, 0xF2, 0xFC), line=None)
    text(sl, 0.75, 6.0, 11.8, 0.8, [[('Journey  ', {'bold': True, 'color': BLUE}), ('photo of prescription → confirmed schedule → daily one-tap records → timeline → QR to doctor → cited briefing at the visit.', {})],
                                   [('Expected impact  ', {'bold': True, 'color': BLUE}), ('fewer duplicate-ingredient and missed-dose surprises; visits that start from facts; families who can help safely.', {})]], size=12)

    # 6. Technology & AI
    sl = s[5]; heading(sl, 'Technology, Tools and AI Approach'); remove(sl, *[b.name for b in body_shape(sl)])
    flow = [('Phone / desktop', 'React 19 PWA\nlight + dark, iPhone install'), ('Express API', 'Node 24 · Zod validation\nhelmet CSP · rate limits'), ('PostgreSQL', 'Neon (Singapore)\naudit trail, versioned records')]
    for i, (h, sub) in enumerate(flow):
        x = 0.55 + i * 2.75
        card(sl, x, 1.25, 2.45, 1.15, fill=RGBColor(0xFF, 0xFF, 0xFF))
        text(sl, x + 0.1, 1.3, 2.25, 1.05, [(h, {'bold': True, 'color': BLUE, 'size': 13}), (sub, {'size': 10, 'color': GREY})], align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        if i < 2: text(sl, x + 2.45, 1.6, 0.3, 0.4, [('→', {'size': 18, 'bold': True, 'color': BLUE})], align=PP_ALIGN.CENTER)
    card(sl, 0.55, 2.6, 7.95, 1.3)
    text(sl, 0.7, 2.65, 7.7, 1.2, [(f'AI layer (one contract, swappable engines)', {'bold': True, 'color': BLUE, 'size': 13}),
                                  ('Server: Groq · Qwen 3.8 27B (vision + text), fallback gpt-oss-20b, OpenAI-compatible so any model server can plug in.', {'size': 11}),
                                  ('Phone: partner’s on-device small vision/text models via window adapter — same prompts, same schema checks; records can stay on the phone.', {'size': 11})])
    card(sl, 0.55, 4.05, 7.95, 0.95)
    text(sl, 0.7, 4.1, 7.7, 0.85, [('Trusted data sources', {'bold': True, 'color': BLUE, 'size': 13}), ('DailyMed + openFDA labels · Open Food Facts · USDA FoodData Central · NIDDK / NCCIH / MedlinePlus for education', {'size': 11})])
    table(sl, 8.75, 1.25, 4.0, [['AI job', 'Output (checked)'], ['Read prescription', 'medicines, timing, confidence'], ['Identify meal', 'foods + rough grams only'], ['Timeline summary', 'points citing record IDs'], ['Myth check', 'verdict + known sources'], ['Label in simple words', 'summary, pharmacist Qs']], [1.6, 2.4], size=10.5, row_h=0.62)
    bullets(sl, 0.55, 5.2, 12.2, 1.8, [('Draft, never decide:', 'AI output is shown as a draft; nothing is saved until the patient confirms.'),
                                      ('Grounded:', 'summaries may only cite supplied records; unknown citations are removed. Myth answers may only cite curated cards.'),
                                      ('Robust:', 'strict JSON schemas, length normalisation, 30-min cache, automatic retry and model fallback; graceful “AI busy” message.')], size=11.5, gap=3)

    # 7. Build sprint
    sl = s[6]; remove(sl, *[b.name for b in body_shape(sl)])
    sprints = [('Sprint 1', 'Foundations', 'Data model, synthetic patient journeys, clickable prototype, safety boundaries'),
               ('Sprint 2', 'Real accounts & records', 'Accounts, recovery codes, 13 record types, versioning, audit log, family sharing'),
               ('Sprint 3', 'Knowledge & learning', 'DailyMed/openFDA/OFF/USDA search, ingredient overlap, 4 narrated Manim lessons, HCI revision'),
               ('Sprint 4', 'AI, doctor loop, launch', 'AI layer + eval, timeline, doctor links, QR sign-in, redesign, website, deploy')]
    text(sl, 0.55, 1.15, 12, 0.35, [('Four sprints, each ending in a working, tested release', {'size': 13, 'color': GREY, 'bold': True})])
    bar(sl, 0.55, 1.62, 12.2, 0.06, LINE)
    for i, (sp, title, what) in enumerate(sprints):
        x = 0.55 + i * 3.1
        bar(sl, x, 1.75, 2.95, 0.5, BLUE if i == 3 else GREEN)
        text(sl, x + 0.12, 1.75, 2.75, 0.5, [[(f'{sp}  ', {'bold': True, 'color': RGBColor(0xFF, 0xFF, 0xFF), 'size': 11}), (title, {'bold': True, 'color': RGBColor(0xFF, 0xFF, 0xFF), 'size': 12})]], anchor=MSO_ANCHOR.MIDDLE)
        card(sl, x, 2.35, 2.95, 2.45, fill=RGBColor(0xFF, 0xFF, 0xFF))
        bullets(sl, x + 0.12, 2.45, 2.75, 2.3, [w.strip()[0].upper() + w.strip()[1:] for w in what.split(',')], size=11.5, gap=3)
    card(sl, 0.55, 5.05, 12.2, 1.5, fill=RGBColor(0xEE, 0xF2, 0xFC), line=None)
    text(sl, 0.75, 5.12, 11.8, 1.4, [('Delivered', {'bold': True, 'color': BLUE, 'size': 13}),
                                     ('Live MVP on Render + Neon · 40+ API endpoints · 5 AI features behind one provider-neutral contract · 175 automated unit/API tests and 29 browser tests (desktop, 390 px and 320 px, light/dark, axe WCAG A/AA) · README with full API and on-device integration guide.', {'size': 12}),
                                     ('Hardest problems solved: grounding AI citations, safe multi-doctor schedules in India time, and sign-in across devices without passwords.', {'size': 12, 'color': GREY})])

    # 8. Evaluation
    sl = s[7]; remove(sl, *[b.name for b in body_shape(sl)])
    label(sl, 0.55, 1.15, 6, 'AI evaluation (Groq · Qwen 3.8 27B, 5 Nov 2026)', size=13)
    table(sl, 0.55, 1.5, 6.4, [['Task', 'Test set', 'Result'],
                              ['Myth check', '13 claims (9 myths, 3 true, 1 off-topic)', '13/13 correct · 13/13 valid citations · median 0.67 s'],
                              ['Prescription scan', 'Synthetic printed Rx, 4 medicines', '4/4 names · 4/4 strengths · 3/4 timings · 0 invented'],
                              ['Timeline summary', 'Synthetic 5-month record (~85 records)', 'All citations resolve to real records (unknown IDs removed)'],
                              ['Meal photo', '1 thali photo', 'No items returned → fallback to search; prompt fix queued']],
          [1.5, 2.2, 2.7], size=10, row_h=0.55)
    label(sl, 7.2, 1.15, 5.6, 'Software quality', size=13)
    bullets(sl, 7.2, 1.5, 5.55, 2.8, ['175 unit/API tests: auth, permissions, concurrency, AI schemas, QR sign-in, doctor links',
                                       '29 browser tests on 3 screen sizes, light + dark, automated WCAG A/AA (axe) checks',
                                       'Security: hashed tokens, SameSite cookies, CSP, rate limits, number-matching QR approval',
                                       'Live provider checks: DailyMed, openFDA, Open Food Facts, USDA'], size=11, gap=3)
    card(sl, 0.55, 4.45, 12.2, 2.0)
    label(sl, 0.75, 4.55, 6, 'User validation', size=13)
    text(sl, 0.75, 4.9, 5.8, 2.0, [('Formal testing with patients and doctors has not yet been done. We report only technical results above.', {'size': 11.5}),
                                  ('[Add any feedback from your doctor partner or test users here: who, how many, what changed.]', {'size': 11, 'italic': True, 'color': AMBER})])
    label(sl, 6.85, 4.55, 6, 'Improvements made from testing', size=13)
    bullets(sl, 6.85, 4.9, 5.7, 2.0, ['Paracetamol ↔ acetaminophen alias after label search failed for Indian names',
                                       'Calmer, flatter UI and “next dose” home after review of first design',
                                       'Output normaliser + fallback model after AI replies broke strict schemas'], size=11, gap=3)

    # 9. Safety
    sl = s[8]; remove(sl, *[b.name for b in body_shape(sl)])
    table(sl, 0.55, 1.2, 12.2, [['Risk', 'What we do'],
                               ['AI misreads a prescription', 'Draft only; each line shows confidence; patient edits and confirms; nothing auto-saved'],
                               ['AI invents facts in a summary', 'Records-only prompt; every point must cite record IDs; unknown IDs dropped; “verify before clinical use” banner'],
                               ['Medical advice from AI', 'Prompts forbid diagnosis, doses and glucose prediction; no free-text chat; myth answers limited to curated sources'],
                               ['Wrong person sees data', 'Owner-only sharing with scopes; doctor links expire + revocable; QR sign-in needs number match on phone'],
                               ['Health data exposure', 'Photos never stored; tokens hashed; HttpOnly cookies; CSP; no PHI in logs; export + delete account'],
                               ['Emergencies', 'Not a monitoring service: 112 shown in Help; low-glucose education links to NIDDK guidance']],
          [3.2, 9.0], size=11, row_h=0.5)
    card(sl, 0.55, 5.0, 12.2, 1.95, fill=RGBColor(0xEE, 0xF2, 0xFC), line=None)
    text(sl, 0.75, 5.07, 11.8, 1.8, [('Human in the loop and known limits', {'bold': True, 'color': BLUE, 'size': 13}),
                                     ('The patient confirms every AI draft; the doctor sees sources for every AI statement; the doctor partner reviews content. Overlap detection compares entered ingredients — it is not a licensed interaction database. Labels are US (DailyMed/openFDA). Pilot uses test data only; free-tier AI is not used for real patient records; DPDP Act 2023 consent and on-device AI are the path to real data.', {'size': 11.5})])

    # 10. Deployment & cost
    sl = s[9]; remove(sl, *[b.name for b in body_shape(sl)])
    table(sl, 0.55, 1.2, 6.7, [['Item', 'Today (MVP)', 'Clinic pilot (est.)'],
                              ['Web hosting', 'Render free', 'Render Starter ≈ ₹620/mo'],
                              ['Database', 'Neon free', 'Neon Launch ≈ ₹1,300/mo'],
                              ['AI (server)', 'Groq free tier', '≈ ₹0.15 per AI summary*'],
                              ['On-device AI', '—', '₹0 per use (runs on phone)'],
                              ['Domain + email', '—', '≈ ₹1,000/yr (one-time)'],
                              ['Total', '₹0', '≈ ₹2,000–3,000/mo for ~500 users']],
          [1.7, 2.0, 3.0], size=11, row_h=0.42)
    text(sl, 0.55, 4.2, 6.7, 0.5, [('*Estimate from token counts (~4k in / 0.8k out) at Qwen-class prices; USD at ≈ ₹88.', {'size': 9, 'italic': True, 'color': GREY})])
    label(sl, 7.5, 1.15, 5.2, 'Pilot requirements', size=13)
    bullets(sl, 7.5, 1.5, 5.25, 2.6, ['One outpatient clinic + its patients; consent forms', 'Hosting in India region; DPDP Act 2023 privacy notice', 'Doctor partner signs off content and AI prompts', 'Regulatory check: records/education tool, no diagnosis (SaMD advice before any decision support)'], size=11, gap=3)
    label(sl, 0.55, 4.75, 6, 'Who pays (proposed)', size=13)
    table(sl, 0.55, 5.1, 12.2, [['Patient', 'Family Plus', 'Clinic'], ['Free: tracking, timeline, doctor links, learning, fair-use AI', '₹99/month: unlimited AI scans + summaries, up to 5 carers', '₹1,499/doctor/month: briefing inbox, printable summaries, staff seats']], [4.07, 4.07, 4.06], size=11, row_h=0.5, first_col_bold=False)
    text(sl, 0.55, 6.25, 12.2, 0.5, [[('Break-even  ', {'bold': True, 'color': GREEN, 'size': 12}), ('≈ 25 Family Plus subscribers (₹2,475) or 2 clinic seats (₹2,998) cover the monthly pilot infrastructure.', {'size': 12})]])
    text(sl, 7.5, 4.2, 5.25, 0.5, [('Scales horizontally: stateless API, sessions in Postgres.', {'size': 10, 'color': GREY, 'italic': True})])

    # 11. What next
    sl = s[10]; remove(sl, *[b.name for b in body_shape(sl)])
    steps = [('0–1 month', 'Pilot with doctor partner’s clinic: 20 patients, consent, weekly feedback; Hindi + Marathi UI'),
             ('1–3 months', 'On-device AI as default (records stay on phone); WhatsApp reminders; refill alerts from stock counts'),
             ('3–6 months', 'Indian drug database for brand → ingredient; glucometer/CGM import; pharmacist review queue'),
             ('6–12 months', 'Clinic plan with 3–5 clinics; outcome study (missed doses, HbA1c change, visit time)')]
    for i, (when, what) in enumerate(steps):
        y = 1.2 + i * 0.95
        bar(sl, 0.55, y, 0.08, 0.75, BLUE)
        text(sl, 0.8, y, 2.0, 0.75, [(when, {'bold': True, 'color': BLUE, 'size': 14})], anchor=MSO_ANCHOR.MIDDLE)
        text(sl, 2.8, y, 9.9, 0.75, [(what, {'size': 13})], anchor=MSO_ANCHOR.MIDDLE)
    card(sl, 0.55, 5.15, 12.2, 1.8, fill=RGBColor(0xEE, 0xF2, 0xFC), line=None)
    text(sl, 0.75, 5.22, 11.8, 1.65, [[('Publicly available?  ', {'bold': True, 'color': BLUE}), ('Yes — the MVP is live at ' + MVP + ' (pilot: test records only). Code: ' + REPO.replace('https://', ''), {})],
                                     [('Funding & partners  ', {'bold': True, 'color': BLUE}), ('[Planned grants, incubators or partners]', {'italic': True, 'color': AMBER})],
                                     [('Ask  ', {'bold': True, 'color': BLUE}), ('Introductions to diabetologists and clinics willing to run a 3-month pilot.', {})]], size=13)

    # 12. Thank you
    sl = s[11]
    for sh in sl.shapes:
        if not sh.has_text_frame: continue
        t = sh.text_frame.text
        if t.startswith('[Team name]'): set_text(sh, f'{TEAM}  •  {CODE}')
        elif t.startswith('[Contact email]'): set_text(sh, f'[Contact email]  |  {MVP.replace("https://", "")}  |  {REPO.replace("https://", "")}')
    text(sl, 2.0, 4.72, 9.3, 0.6, [('Demo video: ' + DEMO.replace('https://', ''), {'size': 11, 'color': GREY}), ('Showcase login (synthetic data): sunita.sharma@example.com  /  Showcase-Sunita-2026!', {'size': 11, 'color': GREY})], align=PP_ALIGN.CENTER)

    OUT.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT / 'DiabeatIT-Final-Submission.pptx'))


def fill_box(shape, sections, size=10.5):
    """Rewrites a template text box as headed sections, keeping its position and frame."""
    tf = shape.text_frame
    tf.margin_left = tf.margin_right = Inches(0.1)
    for p in list(tf.paragraphs)[1:]: p._p.getparent().remove(p._p)
    first = True
    for head, lines in sections:
        para = tf.paragraphs[0] if first else tf.add_paragraph(); first = False
        for r in list(para.runs): r._r.getparent().remove(r._r)
        para.space_before = Pt(0 if para is tf.paragraphs[0] else 6); para.space_after = Pt(2); para.alignment = PP_ALIGN.LEFT
        r = para.add_run(); r.text = head; r.font.name = FONT; r.font.size = Pt(12); r.font.bold = True; r.font.underline = True; r.font.color.rgb = RGBColor(0x2E, 0x5C, 0x9E)
        for line in lines:
            p = tf.add_paragraph(); p.space_after = Pt(1); p.alignment = PP_ALIGN.LEFT
            runs = line if isinstance(line, list) else [(line, {})]
            for t, st in runs:
                rr = p.add_run(); rr.text = t; rr.font.name = FONT; rr.font.size = Pt(st.get('size', size)); rr.font.bold = st.get('bold', False); rr.font.italic = st.get('italic', False); rr.font.underline = False
                rr.font.color.rgb = st.get('color', INK)


def build_brief():
    prs = Presentation(str(ROOT / 'Two-page Solution Brief Template.pptx'))
    p1, p2 = prs.slides
    for sl in (p1, p2):
        for sh in sl.shapes:
            if sh.is_placeholder and sh.placeholder_format.idx == 0:
                tf = sh.text_frame; runs = [r for p in tf.paragraphs for r in p.runs]
                runs[0].text = f'{TEAM} |'
                for r in runs[1:]: r.text = ''
                runs[-1].text = 'DiabeatIT'
    remove(p1, 'object 2')
    b = lambda h: (h, {'bold': True})
    left = next(sh for sh in p1.shapes if sh.name == 'object 7')
    fill_box(left, [
        ('About the Team / Organisation', [
            [b('A. Team. '), ('Abhay Bhandarkar — product lead, full-stack and AI engineering. [Team member] — on-device AI (small vision + text models). [Organisation].', {})],
            [b('B. Doctor partner. '), ('[Name, specialty, years of practice] — reviews workflows, AI prompts and patient content; hosts the first clinic pilot.', {'italic': True, 'color': AMBER})]]),
        ('Problem Statement (use case specific)', [
            'India has 101 million adults with diabetes and 136 million with prediabetes (ICMR–INDIAB, 2023). Adults aged 40–65 often take medicines from several doctors, written on separate paper prescriptions.',
            'Duplicated ingredients (e.g. paracetamol in a cold tablet and Dolo 650), missed doses and lost readings go unnoticed; WHO estimates long-term adherence averages ~50%.',
            'Consultations are short (~2 minutes in Indian primary care, BMJ Open 2017), so visits start from memory. Families want to help but have no safe shared view, and health myths spread faster than guidance.',
            [b('Users: '), ('patients at home, family carers, and outpatient doctors.', {})]]),
    ], size=11)
    for i, name in enumerate(['phone-light-today', 'phone-light-rx-result', 'phone-light-myth']):
        picture(p1, FRAMED / f'{name}.png', 0.85 + i * 1.95, 4.75, h=2.3)
    right = next(sh for sh in p1.shapes if sh.name == 'object 10')
    fill_box(right, [
        ('AI Solution Description', [
            'DiabeatIT is a phone-first web app that keeps one calm, shared record of medicines, readings, visits and lab results. AI turns photos and long histories into drafts the patient confirms: a prescription becomes a daily schedule; months of records become a one-minute doctor briefing in which every statement links to its source record. A doctor opens it by scanning a QR code — read-only, time-limited and revocable.']),
        ('Technology and Tools Used', [
            'React 19 PWA · Node/Express API · PostgreSQL (Neon) · Render hosting.',
            'AI: Qwen 3.8 27B (vision + text) on Groq with gpt-oss-20b fallback; OpenAI-compatible contract so the partner’s on-device small models run the same prompts and schema checks on the phone.',
            'Data: DailyMed, openFDA, Open Food Facts, USDA FoodData Central; education grounded in NIDDK, NCCIH, MedlinePlus.']),
        ('Key Features of the solution', [
            '1. Prescription scan → confirmed schedule; next-dose home with one-tap records.',
            '2. Care timeline + doctor link with cited AI briefing.',
            '3. Same-ingredient overlap alerts with official label text in simple words.',
            '4. Myth check against curated sources + narrated video lessons.',
            '5. Family care circle with per-record permissions; phone-as-key QR sign-in.']),
    ], size=11)
    picture(p1, ROOT / 'artifacts' / 'mvp-qr.png', 6.95, 5.9, h=1.1)
    text(p1, 8.2, 5.95, 4.6, 1.05, [('Scan to open the live app', {'bold': True, 'color': BLUE, 'size': 12}), (MVP.replace('https://', ''), {'size': 11}), ('Showcase login (synthetic data): sunita.sharma@example.com / Showcase-Sunita-2026!', {'size': 9.5, 'color': GREY})])

    left2 = next(sh for sh in p2.shapes if sh.name == 'object 5')
    fill_box(left2, [
        ('Build Sprint Progress', [
            'Four sprints: data model and prototype → real accounts, 13 record types, audit and family sharing → medicine/food knowledge search, ingredient overlap and four narrated lessons → AI layer, timeline, doctor links, QR sign-in, redesign and deployment.',
            'Delivered: live MVP, 40+ API endpoints, 5 AI features behind one provider-neutral contract, full README and integration guide.']),
        ('User Validation and AI Evaluation', [
            'Myth check: 13/13 correct verdicts, 13/13 valid citations, median 0.67 s. Prescription scan (synthetic): 4/4 names, 4/4 strengths, 3/4 timings, 0 invented medicines. Summaries: all citations resolve to real records. Meal photo: 1 failure → search fallback.',
            '175 unit/API tests + 29 browser tests (3 screen sizes, light/dark, WCAG A/AA checks).',
            [('Patient and doctor testing not yet done; [add partner/user feedback here].', {'italic': True, 'color': AMBER})]]),
    ], size=11)
    picture_fit(p2, SHOTS / 'desktop-light-timeline-summary.png', 0.95, 4.65, 5.25, 1.95)
    right2 = next(sh for sh in p2.shapes if sh.name == 'object 3')
    fill_box(right2, [
        ('Safety and Responsible AI', [
            'AI produces drafts only; nothing is saved until the patient confirms. Prompts forbid diagnosis, dosing and glucose prediction; outputs must pass strict schemas; summary citations to unknown records are removed; myth answers may only cite curated sources.',
            'Sharing is owner-controlled with scopes; doctor links expire, are revocable and every view is audited; QR sign-in needs number matching. Photos are not stored; tokens are hashed; CSP and rate limits; no health data in logs.',
            'Limits: overlap uses entered ingredients (not a licensed interaction database); US label data; test records only on free-tier AI.']),
        ('Deployment and Sustainability', [
            'Live today at ₹0 on free tiers (Render, Neon, Groq). Clinic pilot ≈ ₹2,000–3,000/month for ~500 users; on-device AI removes per-use AI cost.',
            'Model: free for patients; Family Plus ₹99/month; Clinic ₹1,499/doctor/month. Next: 20-patient clinic pilot, Hindi/Marathi, DPDP-compliant consent.']),
        ('Supporting Links', [
            [b('MVP: '), (MVP.replace('https://', ''), {}), (' · website ' + MVP.replace('https://', '') + '/about', {})],
            [b('Demo video: '), (DEMO.replace('https://', ''), {})],
            [b('Code: '), (REPO.replace('https://', ''), {})]]),
    ], size=11)
    picture_fit(p2, SHOTS / 'desktop-light-doctor-summary.png', 6.75, 5.45, 5.5, 1.0)
    OUT.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT / 'DiabeatIT-Solution-Brief.pptx'))


if __name__ == '__main__':
    build_deck(); build_brief(); print('saved to', OUT)
