from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


OUTPUT = Path("output/pdf")
OUTPUT.mkdir(parents=True, exist_ok=True)


def text(c, x, y, value, size=9, bold=False):
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.drawString(x, y, value)


def table_row(c, y, cells, positions, bold=False):
    for position, value in zip(positions, cells):
        text(c, position, y, value, 8, bold)


def create_printed_roster():
    file = OUTPUT / "06-paper-roster.pdf"
    c = canvas.Canvas(str(file), pagesize=letter)
    positions = [48, 90, 205, 320, 370, 420, 485]

    text(c, 48, 752, "Spring Saturday recreational registrations", 15, True)
    text(c, 48, 734, "Printed from the organizer workbook. Payment and contact details are shown for context only.", 8)
    text(c, 48, 712, "Mixed 3.5", 12, True)
    table_row(c, 694, ["Team #", "Player 1", "Player 2", "DUPR 1", "DUPR 2", "Email"], positions, True)
    table_row(c, 676, ["1", "Maya Bennett", "Lucas Harper", "3.11", "3.18", "maya.bennett@example.test"], positions)
    table_row(c, 658, ["2", "Nina Patel", "Owen Brooks", "3.25", "3.09", "nina.patel@example.test"], positions)
    text(c, 48, 628, "Men's 4.0", 12, True)
    table_row(c, 610, ["Team #", "Player 1", "Player 2", "DUPR 1", "DUPR 2", "Email"], positions, True)
    table_row(c, 592, ["1", "Alex Morgan", "Sam Rivera", "3.62", "3.57", "alex.morgan@example.test"], positions)
    table_row(c, 574, ["2", "Jamie Kim", "Chris Wong", "3.71", "3.66", "jamie.kim@example.test"], positions)
    text(c, 48, 536, "Payment total: $160. Contact the organizer before changing the roster.", 8)
    c.save()


def create_unlabeled_roster():
    file = OUTPUT / "07-flyer-signups.pdf"
    c = canvas.Canvas(str(file), pagesize=letter)
    positions = [48, 90, 205, 320, 370, 420, 485]
    for page, group, names in [
        (1, "Group A", [("1", "Avery Stone", "Morgan Reed", "3.41", "3.45", "avery.stone@example.test"), ("2", "Casey Young", "Drew Park", "3.36", "3.31", "casey.young@example.test")]),
        (2, "Group B", [("1", "Elliot King", "Noah Bell", "4.01", "4.08", "elliot.king@example.test"), ("2", "Parker Cole", "Quinn Fox", "4.12", "4.06", "parker.cole@example.test")]),
    ]:
        text(c, 48, 752, "Community pickleball sign-up sheet", 15, True)
        text(c, 48, 734, f"Page {page} - division labels were not included in the source printout", 8)
        text(c, 48, 710, group, 12, True)
        table_row(c, 692, ["Team #", "Player 1", "Player 2", "DUPR 1", "DUPR 2", "Email"], positions, True)
        for offset, row in enumerate(names):
            table_row(c, 674 - offset * 18, list(row), positions)
        text(c, 48, 590, "Paid status and phone list are maintained by the organizer.", 8)
        if page == 1:
            c.showPage()
    c.save()


create_printed_roster()
create_unlabeled_roster()
print("Generated output/pdf/06-paper-roster.pdf and output/pdf/07-flyer-signups.pdf")
