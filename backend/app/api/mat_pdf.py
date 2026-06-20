from io import BytesIO

import cv2
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from PIL import Image as PILImage
from reportlab.lib.pagesizes import A3, A4, landscape
from reportlab.lib.units import cm as rl_cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

router = APIRouter()

PAPER_SIZES = {
    "A4":  A4,
    "A3":  A3,
    "A4L": landscape(A4),
    "A3L": landscape(A3),
}

DICT_MAP = {
    "DICT_4X4_50":  (cv2.aruco.DICT_4X4_50,  50),
    "DICT_4X4_100": (cv2.aruco.DICT_4X4_100, 100),
    "DICT_5X5_50":  (cv2.aruco.DICT_5X5_50,  50),
    "DICT_6X6_50":  (cv2.aruco.DICT_6X6_50,  50),
}


def _marker_image_reader(aruco_dict, marker_id: int, size_px: int = 400) -> ImageReader:
    img = cv2.aruco.generateImageMarker(aruco_dict, marker_id, size_px)
    pil = PILImage.fromarray(img)
    buf = BytesIO()
    pil.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


def _draw_mat_page(
    c: canvas.Canvas,
    page_w: float, page_h: float,
    cols: int, rows: int,
    cell: float, pad: float,
    aruco_dict,
    id_offset: int,
    title: str,
    subtitle: str,
    grid_cm: float,
):
    """1ページ分のマット（グリッド + 四隅マーカー）を描画する。"""
    marker_size = cell - 2 * pad

    # グリッド全体をページ中央に配置（上部にタイトル余白）
    title_h = 1.4 * rl_cm
    mat_w = cols * cell
    mat_h = rows * cell
    ox = (page_w - mat_w) / 2
    oy = (page_h - mat_h - title_h) / 2

    # ── グリッド線 ──────────────────────────────────────────────
    c.setStrokeColorRGB(0.65, 0.65, 0.65)
    c.setLineWidth(0.4)
    for i in range(cols + 1):
        x = ox + i * cell
        c.line(x, oy, x, oy + mat_h)
    for j in range(rows + 1):
        y = oy + j * cell
        c.line(ox, y, ox + mat_w, y)

    # ── 外枠 ──────────────────────────────────────────────────
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(1.5)
    c.rect(ox, oy, mat_w, mat_h)

    # ── 四隅マーカー ──────────────────────────────────────────
    # ReportLab は左下原点なので:
    #   top-left  → row=rows-1, col=0
    #   top-right → row=rows-1, col=cols-1
    #   bot-left  → row=0,      col=0
    #   bot-right → row=0,      col=cols-1
    corners = [
        (rows - 1, 0,        id_offset + 0, "TL"),
        (rows - 1, cols - 1, id_offset + 1, "TR"),
        (0,        0,        id_offset + 2, "BL"),
        (0,        cols - 1, id_offset + 3, "BR"),
    ]
    for row_i, col_i, mid, pos in corners:
        x = ox + col_i * cell
        y = oy + row_i * cell
        c.drawImage(
            _marker_image_reader(aruco_dict, mid),
            x + pad, y + pad,
            width=marker_size, height=marker_size,
            preserveAspectRatio=True,
        )
        c.setFont("Helvetica-Bold", 6)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawCentredString(x + cell / 2, y + 2, f"ID {mid}")
        c.setFillColorRGB(0, 0, 0)

    # ── 上端に「TOP →」矢印ライン ─────────────────────────────
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(1.0)
    arr_y = oy + mat_h + 0.3 * rl_cm
    c.line(ox, arr_y, ox + mat_w, arr_y)
    # 矢印
    arr_tip = ox + mat_w
    c.line(arr_tip - 6, arr_y - 4, arr_tip, arr_y)
    c.line(arr_tip - 6, arr_y + 4, arr_tip, arr_y)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(ox + 2, arr_y + 3, "TOP")

    # ── タイトル ──────────────────────────────────────────────
    c.setFont("Helvetica-Bold", 14)
    c.setFillColorRGB(0, 0, 0)
    c.drawCentredString(page_w / 2, oy + mat_h + 0.85 * rl_cm, title)

    # ── 凡例（下部） ───────────────────────────────────────────
    legend_y = oy - 0.7 * rl_cm
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.drawString(
        ox, legend_y,
        f"{subtitle}  |  Cell: {grid_cm} cm x {grid_cm} cm  |  "
        f"Mat: {cols * grid_cm:.0f} cm x {rows * grid_cm:.0f} cm  |  "
        f"Corner IDs: {id_offset}–{id_offset + 3}",
    )

    # 1 cm スケールバー
    bar_x = ox + mat_w - 3.5 * rl_cm
    bar_y = legend_y - 0.35 * rl_cm
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(1.0)
    c.line(bar_x, bar_y, bar_x + rl_cm, bar_y)
    c.line(bar_x, bar_y - 2, bar_x, bar_y + 2)
    c.line(bar_x + rl_cm, bar_y - 2, bar_x + rl_cm, bar_y + 2)
    c.setFont("Helvetica", 7)
    c.setFillColorRGB(0, 0, 0)
    c.drawCentredString(bar_x + rl_cm / 2, bar_y + 4, "1 cm")


@router.get("/mat-pdf")
def generate_mat_pdf(
    grid_cm: float = Query(5.0, gt=0, description="Grid cell size in cm"),
    cols: int | None = Query(None, gt=0, le=30, description="Number of columns (auto if omitted)"),
    rows: int | None = Query(None, gt=0, le=30, description="Number of rows (auto if omitted)"),
    paper: str = Query("A4", description="A4 | A3 | A4L | A3L"),
    dictionary: str = Query("DICT_4X4_50"),
):
    paper_size = PAPER_SIZES.get(paper, A4)
    dict_id, _ = DICT_MAP.get(dictionary, DICT_MAP["DICT_4X4_50"])

    page_w, page_h = paper_size
    margin = 1.0 * rl_cm
    cell = grid_cm * rl_cm
    pad = cell * 0.08

    if cols is None:
        cols = max(2, int((page_w - 2 * margin) / cell))
    if rows is None:
        legend_h = 2.4 * rl_cm
        rows = max(2, int((page_h - 2 * margin - legend_h) / cell))

    aruco_dict = cv2.aruco.getPredefinedDictionary(dict_id)

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=paper_size)

    # ── Page 1: 床マット（Floor）IDs 0–3 ────────────────────
    _draw_mat_page(
        c, page_w, page_h,
        cols, rows, cell, pad,
        aruco_dict,
        id_offset=0,
        title="床マット (Floor)",
        subtitle="Place flat on the floor — top-view photo",
        grid_cm=grid_cm,
    )
    c.showPage()

    # ── Page 2: 壁マット（Wall）IDs 4–7 ─────────────────────
    _draw_mat_page(
        c, page_w, page_h,
        cols, rows, cell, pad,
        aruco_dict,
        id_offset=4,
        title="壁マット (Wall)",
        subtitle="Stand vertically on the side — side-view photo",
        grid_cm=grid_cm,
    )
    c.showPage()

    c.save()
    buf.seek(0)

    filename = f"aruco_mat_{grid_cm}cm_{cols}x{rows}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
