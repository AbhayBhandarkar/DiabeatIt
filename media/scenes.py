"""Original Manim diagrams. No TeX, stock footage, or slide-to-video conversion."""
import json
from pathlib import Path

from manim import (
    Scene, VGroup, Text, RoundedRectangle, Circle, Line, Arrow,
    FadeIn, FadeOut, Create, Transform, Indicate, LaggedStart,
    UP, DOWN, LEFT, RIGHT, WHITE, Ellipse, VMobject, Dot,
)

DATA = json.loads((Path(__file__).parent / "lesson_data.json").read_text(encoding="utf-8"))
BG = "#0B1824"
PANEL = "#142A39"
MINT = "#A9C6FF"
GOLD = "#FFD38A"
LILAC = "#BCADFF"
MUTED = "#B4C8D4"


def label(text: str, size: float = 28, color: str = WHITE, width: float = 12) -> Text:
    item = Text(text, font="Segoe UI", font_size=size, color=color, line_spacing=1.15)
    if item.width > width:
        item.scale_to_fit_width(width)
    return item


def token(text: str, color: str = MINT) -> VGroup:
    return VGroup(Circle(radius=0.39, color=color, fill_color=color, fill_opacity=0.13),
                  label(text, 27, color, 0.65))


def card(title: str, detail: str, color: str = MINT, width: float = 4.8) -> VGroup:
    box = RoundedRectangle(width=width, height=2.3, corner_radius=0.2,
                           stroke_color=color, stroke_width=2, fill_color=PANEL, fill_opacity=1)
    heading = label(title, 29, color, width - 0.4).move_to(UP * 0.56)
    body = label(detail, 23, WHITE, width - 0.4).move_to(DOWN * 0.3)
    return VGroup(box, heading, body)


class LessonScene(Scene):
    lesson_index = 0

    def construct(self):
        self.camera.background_color = BG
        self.lesson = DATA[self.lesson_index]
        self.add(label("DIABEATIT   /   VISUAL LESSONS", 17, MINT).move_to([-3.8, 3.55, 0]))
        self.add(label("48 SEC  /  SYNTHETIC VOICE", 15, MUTED).move_to([4.5, 3.55, 0]))
        self.add(Line([-6.4, 3.2, 0], [6.4, 3.2, 0], color=PANEL))
        footer = ["FDA + AHRQ | Illustrative products", "FDA | Example label; US reference", "AHRQ + NHS | Illustrative record", "NIDDK | Simplified biological process, not to scale"][self.lesson_index]
        self.add(label(footer + " | General education, not treatment advice", 15, MUTED).move_to([0, -3.7, 0]))
        self.dots = VGroup(*[Circle(radius=0.045, color=MUTED, fill_opacity=1).move_to([-0.45 + i * 0.18, 3.55, 0]) for i in range(6)])
        self.add(self.dots)
        for step in range(6):
            self.dots[step].set_color(MINT)
            self.heading = label(self.lesson["chapters"][step], 38).move_to([0, 2.6, 0])
            self.add(self.heading)
            if self.lesson_index == 3:
                self.biology(step)
            elif step == 3:
                self.checkpoint()
            else:
                (self.brands, self.portions, self.uncertainty)[self.lesson_index](step)
            for item in self.mobjects:
                assert item.get_left()[0] >= -7.1 and item.get_right()[0] <= 7.1, "Horizontal frame overflow"
                assert item.get_top()[1] <= 4 and item.get_bottom()[1] >= -4, "Vertical frame overflow"
            # Every chapter occupies exactly 192 frames at 24 fps.
            remaining_frames = (step + 1) * 192 - 12 - round(float(self.time) * 24)
            self.wait(remaining_frames / 24)
            removable = [m for m in self.mobjects if m not in self.persistent]
            self.play(*[FadeOut(m) for m in removable], run_time=0.5)

    @property
    def persistent(self):
        # The first five mobjects are the permanent visual shell.
        return self.mobjects[:5]

    def caption(self, text: str, color: str = MINT):
        item = label(text, 28, color).move_to([0, -2.65, 0])
        self.play(FadeIn(item, shift=UP * 0.1), run_time=0.5)

    def reveal(self, *items):
        self.play(LaggedStart(*[FadeIn(item, shift=UP * 0.18) for item in items], lag_ratio=0.18), run_time=1)

    def checkpoint(self):
        questions = [
            ("BOX A: X", "BOX B: X + Y", "What does the shared X tell you?"),
            ("12 g per serving", "2 servings", "How much carbohydrate in this portion?"),
            ("No log entry", 'Person: "I am unsure"', "Which record is supported?")
        ]
        a, b, question = questions[self.lesson_index]
        left = card(a, "", MINT).move_to([-3, 0.5, 0])
        right = card(b, "", LILAC).move_to([3, 0.5, 0])
        self.reveal(left, right)
        self.reveal(label(question, 30, GOLD).move_to([0, -1.35, 0]))
        self.caption("PAUSE + THINK   /   Choose in the lesson player", GOLD)

    def brands(self, step: int):
        if step in (0, 1):
            a = card("BOX A", "Brand name A", MINT).move_to([-3, 0.7, 0])
            b = card("BOX B", "Brand name B", LILAC).move_to([3, 0.7, 0])
            self.reveal(a, b)
            x1, x2, y = token("X").move_to([-3, 0, 0]), token("X").move_to([2.5, 0, 0]), token("Y", LILAC).move_to([3.5, 0, 0])
            if step == 1:
                self.play(Transform(a[2], label("Active ingredients", 23).move_to(a[2])),
                          Transform(b[2], label("Active ingredients", 23).move_to(b[2])), run_time=0.75)
            self.play(FadeIn(x1), FadeIn(x2), FadeIn(y), run_time=0.5)
            self.play(x1.animate.move_to([-3, -1.35, 0]), x2.animate.move_to([2.5, -1.35, 0]),
                      y.animate.move_to([3.5, -1.35, 0]), run_time=1.25)
            self.caption("Different names can share an ingredient" if step == 0 else "Read every ingredient, including combination products")
        elif step == 2:
            x1 = token("X").move_to([-4, 0.7, 0])
            x2 = token("X").move_to([4, 0.7, 0])
            center = card("POSSIBLE OVERLAP", "A flag for review", GOLD, 5).move_to([0, -0.45, 0])
            self.reveal(x1, x2)
            self.play(x1.animate.move_to([-0.55, 1.1, 0]), x2.animate.move_to([0.55, 1.1, 0]), run_time=1.25)
            self.reveal(center)
            self.play(Indicate(center[0], color=GOLD), run_time=1)
            self.caption("Check strength + formulation + instructions")
        elif step == 4:
            a = card("SHARED X", "Possible overlap", GOLD).move_to([-3.1, 0.2, 0])
            b = card("CLARIFY", "Pharmacist or prescriber", MINT).move_to([3.1, 0.2, 0])
            self.reveal(a, b)
            self.play(Create(Arrow(a.get_right(), b.get_left(), buff=0.08, color=MINT)), run_time=1)
            self.caption("A match does not decide medicine changes")
        else:
            items = [card("PACKAGING", "Every product", MINT, 3.7), card("PRESCRIPTION", "Current instructions", LILAC, 3.7), card("ACTUAL USE", "What + when", GOLD, 3.7)]
            for i, item in enumerate(items):
                item.move_to([-4.1 + 4.1 * i, 0.3, 0])
            self.reveal(*items)
            self.caption("Bring the whole picture to a professional review")

    def portions(self, step: int):
        if step == 0:
            facts = card("ILLUSTRATIVE LABEL", "Serving size       30 g\nCarbohydrate     12 g", MINT, 6).move_to([-2.5, 0.3, 0])
            serving = self.serving().move_to([3.7, 0.3, 0])
            self.reveal(facts, serving)
            self.play(Indicate(facts[2], color=GOLD), run_time=1.25)
            self.caption("Start with the reference amount")
        elif step in (1, 2):
            a = self.serving().move_to([-2.3, 0.45, 0])
            b = self.serving().move_to([2.3, 0.45, 0])
            self.reveal(a)
            self.play(Transform(a.copy(), b), run_time=1.25)
            self.reveal(label("+", 42, GOLD).move_to([0, 0.45, 0]))
            self.caption("60 g food / 30 g per serving = 2 servings" if step == 1 else "12 g carbohydrate + 12 g carbohydrate")
        elif step == 4:
            equation = label("12 g   ×   2   =   24 g", 54, MINT).move_to([0, 0.85, 0])
            bars = VGroup(*[RoundedRectangle(width=3.4, height=0.6, corner_radius=0.12, color=MINT if i == 0 else LILAC, fill_opacity=0.65).move_to([-1.8 + i * 3.6, -0.5, 0]) for i in range(2)])
            self.reveal(bars[0], bars[1])
            self.play(bars[0].animate.shift(RIGHT * 0.1), bars[1].animate.shift(LEFT * 0.1), run_time=1)
            self.reveal(equation)
            self.caption("24 g carbohydrate in this fictional 60 g portion")
        else:
            a = card("REFERENCE", "Per serving?\nPer package?\nPer 100 g?", LILAC).move_to([-3, 0.35, 0])
            b = card("YOUR PORTION", "Use the matching units", MINT).move_to([3, 0.35, 0])
            self.reveal(a, b)
            self.caption("Serving size is not a recommendation")

    def serving(self):
        bowl = Circle(radius=1.08, color=MINT, fill_color=PANEL, fill_opacity=1)
        grains = VGroup(*[Circle(radius=0.08, color=GOLD, fill_opacity=1).move_to([x * 0.25, y * 0.24, 0]) for x, y in [(-2, 1), (-1, 0), (0, 1), (1, 0), (2, 1), (-1, -1), (1, -1)]])
        mass = label("30 g food", 24).move_to([0, -1.45, 0])
        carbs = label("12 g carbohydrate", 21, MINT).move_to([0, 1.45, 0])
        return VGroup(bowl, grains, mass, carbs)

    def biology(self, step: int):
        gut = VMobject(color="#EDAA90", stroke_width=18)
        gut.set_points_smoothly([[-5.5, 1, 0], [-4.3, 1.15, 0], [-4.0, .6, 0], [-5.4, .45, 0], [-5.5, -.1, 0], [-4.2, -.25, 0]])
        pancreas = VGroup(*[Ellipse(width=.7, height=.45, color="#EDB5CC", fill_opacity=.85).move_to([-1.1 + i*.38, .85 + (i % 2)*.12, 0]) for i in range(6)])
        vessel = RoundedRectangle(width=7.6, height=.9, corner_radius=.4, color="#D495B4", fill_color="#492942", fill_opacity=1).move_to([-1.8, -1.35, 0])
        cell = RoundedRectangle(width=2.5, height=3.1, corner_radius=.65, color=MINT, fill_color="#203964", fill_opacity=.8).move_to([4.75, .15, 0])
        nucleus = Ellipse(width=.65, height=1.0, color=LILAC, fill_opacity=.5).move_to([5.15,.5,0])
        titles = VGroup(label("INTESTINE", 22).move_to([-4.8,1.8,0]), label("PANCREAS",22).move_to([0,1.8,0]), label("MUSCLE CELL",22).move_to([4.75,2,0]),label("BLOODSTREAM",20,MUTED).move_to([-1.8,-2.05,0]))
        glucose = VGroup(*[Dot(point=[-5+i*.9,-1.35,0], radius=.09,color=GOLD) for i in range(7)])
        self.reveal(gut,pancreas,vessel,cell,nucleus,titles,glucose)
        if step == 0:
            self.play(Create(Arrow([-4.8,-.4,0],[-4.8,-.95,0],buff=.05,color=GOLD)),run_time=.7)
            self.play(glucose.animate.shift(RIGHT*.35),run_time=1.2)
            self.caption("Digestion supplies glucose; the liver can supply it too", GOLD)
        elif step == 1:
            signals=VGroup(*[Circle(radius=.1,color=MINT,fill_opacity=1).move_to([-.4+i*.35,.25,0]) for i in range(3)])
            self.play(FadeIn(signals),run_time=.5)
            self.play(signals.animate.shift(DOWN*1.6),run_time=1.3)
            self.caption("Insulin is a hormone made by the pancreas")
        elif step in (2,4):
            self.play(Create(Arrow([2.15,-1.35,0],[3.4,-1.1,0],buff=.1,color=GOLD)),run_time=.7)
            moving=Dot(point=[2,-1.35,0],radius=.11,color=GOLD)
            self.add(moving)
            if step == 2:
                self.play(moving.animate.move_to([4.4,-.7,0]),run_time=1.8)
                self.caption("Insulin signalling helps muscle cells take up glucose")
            else:
                self.play(moving.animate.move_to([3.2,-1.15,0]),run_time=1.8)
                self.play(Indicate(cell,color=GOLD),run_time=.7)
                self.caption("Type 2: reduced response, and insulin may be insufficient", GOLD)
        elif step == 3:
            self.play(Indicate(pancreas,color=MINT),run_time=1)
            self.caption("What does insulin help the body do?", GOLD)
        else:
            self.play(glucose.animate.shift(RIGHT*.3),run_time=1)
            self.caption("One reading is context—not a dose decision")

    def uncertainty(self, step: int):
        if step == 0:
            a = card("08:00 REMINDER", "Notification sent", LILAC).move_to([-3, 0.3, 0])
            b = card("MEDICINE LOG", "No entry", GOLD).move_to([3, 0.3, 0])
            self.reveal(a, b)
            self.play(Indicate(b[2], color=GOLD), run_time=1)
            self.caption("Not recorded does not mean not taken")
        elif step == 1:
            items = [card("REMINDER", "An app event", LILAC, 3.7), card("REPORT", "A person + time", MINT, 3.7), card("INTAKE", "What actually happened", GOLD, 3.7)]
            for i, item in enumerate(items):
                item.move_to([-4.1 + 4.1 * i, 0.3, 0])
            self.reveal(*items)
            self.caption("Three different things; keep the source visible")
        elif step == 2:
            a = token("?", GOLD).move_to([-4, 1, 0])
            b = token("?", LILAC).move_to([4, 1, 0])
            result = card("UNSURE", "Source: person's report\nTime: 08:15", GOLD, 6).move_to([0, -0.15, 0])
            self.reveal(a, b)
            self.play(a.animate.move_to([-0.6, 1.55, 0]), b.animate.move_to([0.6, 1.55, 0]), run_time=1.25)
            self.reveal(result)
            self.caption("An app entry is not proof of swallowing")
        elif step == 4:
            a = card("RECORD UNSURE", "Keep source + time", GOLD).move_to([-3, 0.3, 0])
            b = card("ASK A PROFESSIONAL", "Pharmacist or care team", MINT).move_to([3, 0.3, 0])
            self.reveal(a, b)
            self.caption("No extra-dose decision from an uncertain log")
        else:
            notice = card("SUSPECTED OVERDOSE\nOR SEVERE SYMPTOMS", "Seek urgent local medical help", GOLD, 10).move_to([0, 0.3, 0])
            self.reveal(notice)
            self.caption("Do not wait for an app review", GOLD)


class IngredientOverlap(LessonScene):
    lesson_index = 0


class LabelPortions(LessonScene):
    lesson_index = 1


class UncertainIntake(LessonScene):
    lesson_index = 2

class GlucoseJourney(LessonScene):
    lesson_index = 3