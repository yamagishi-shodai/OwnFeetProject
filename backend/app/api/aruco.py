import numpy as np
import cv2
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

router = APIRouter()

DICT_MAP = {
    "DICT_4X4_50":   cv2.aruco.DICT_4X4_50,
    "DICT_4X4_100":  cv2.aruco.DICT_4X4_100,
    "DICT_5X5_50":   cv2.aruco.DICT_5X5_50,
    "DICT_6X6_50":   cv2.aruco.DICT_6X6_50,
}

# 床マット: IDs 0-3、壁マット: IDs 4-7
# TL=offset+0, TR=offset+1, BL=offset+2, BR=offset+3
FLOOR_IDS = frozenset({0, 1, 2, 3})
WALL_IDS  = frozenset({4, 5, 6, 7})


def _try_detect(gray: np.ndarray, aruco_dict, params) -> tuple:
    detector = cv2.aruco.ArucoDetector(aruco_dict, params)
    return detector.detectMarkers(gray)


@router.post("/debug-aruco")
async def debug_aruco(file: UploadFile = File(...)):
    """マーカーが検出されない原因を調べるデバッグ用エンドポイント。"""
    raw = await file.read()
    img = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return JSONResponse({"error": "画像のデコードに失敗"})

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray_clahe = clahe.apply(gray)

    results = []
    for dict_name, dict_id in DICT_MAP.items():
        aruco_dict = cv2.aruco.getPredefinedDictionary(dict_id)
        p = cv2.aruco.DetectorParameters()
        p.minMarkerPerimeterRate = 0.01  # 非常に小さいマーカーも検出
        detector = cv2.aruco.ArucoDetector(aruco_dict, p)

        _, ids_normal, rejected_normal = detector.detectMarkers(gray)
        _, ids_clahe,  rejected_clahe  = detector.detectMarkers(gray_clahe)

        results.append({
            "dictionary": dict_name,
            "detected_normal": int(len(ids_normal)) if ids_normal is not None else 0,
            "detected_clahe":  int(len(ids_clahe))  if ids_clahe  is not None else 0,
            "ids_normal": ids_normal.flatten().tolist() if ids_normal is not None else [],
            "ids_clahe":  ids_clahe.flatten().tolist()  if ids_clahe  is not None else [],
            "rejected_candidates": max(
                len(rejected_normal) if rejected_normal else 0,
                len(rejected_clahe)  if rejected_clahe  else 0,
            ),
        })

    return {
        "image_size": f"{img.shape[1]}x{img.shape[0]}",
        "brightness_mean": round(float(gray.mean()), 1),
        "brightness_std":  round(float(gray.std()),  1),
        "results": results,
    }


@router.get("/test-aruco")
def test_aruco():
    """ライブラリが正常に動作しているか確認するエンドポイント。"""
    aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    marker = cv2.aruco.generateImageMarker(aruco_dict, 0, 200)
    # quiet zone を付けた状態でテスト
    bordered = cv2.copyMakeBorder(marker, 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)
    params = cv2.aruco.DetectorParameters()
    detector = cv2.aruco.ArucoDetector(aruco_dict, params)
    corners, ids, _ = detector.detectMarkers(bordered)
    ok = ids is not None and len(ids) > 0
    return {"status": "ok" if ok else "fail", "detected": int(len(ids)) if ids is not None else 0}


def _marker_center(corners_entry: np.ndarray) -> np.ndarray:
    return corners_entry.reshape(4, 2).mean(axis=0)


def _dist(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(b - a))


@router.post("/detect-aruco")
async def detect_aruco(
    file: UploadFile = File(...),
    mat_width_cm: float = Form(...),
    mat_height_cm: float = Form(...),
    dictionary: str = Form("DICT_4X4_50"),
    marker_size_cm: float = Form(0.0),
):
    if mat_width_cm <= 0 or mat_height_cm <= 0:
        raise HTTPException(status_code=422, detail="mat_width_cm and mat_height_cm must be positive")

    dict_id = DICT_MAP.get(dictionary)
    if dict_id is None:
        raise HTTPException(status_code=422, detail=f"Unknown dictionary: {dictionary}")

    raw = await file.read()
    img = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=422, detail="Failed to decode image")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # CLAHE でコントラスト強調した版も用意
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray_clahe = clahe.apply(gray)

    aruco_dict = cv2.aruco.getPredefinedDictionary(dict_id)

    # パラメータを段階的に緩めながら最大4回試みる
    attempts = [
        (gray,       cv2.aruco.DetectorParameters()),
        (gray_clahe, cv2.aruco.DetectorParameters()),
    ]
    p3 = cv2.aruco.DetectorParameters()
    p3.adaptiveThreshConstant = 7
    p3.minMarkerPerimeterRate = 0.02
    p3.polygonalApproxAccuracyRate = 0.08
    attempts.append((gray,       p3))
    attempts.append((gray_clahe, p3))

    corners, ids = None, None
    for img_variant, params in attempts:
        corners, ids, _ = _try_detect(img_variant, aruco_dict, params)
        if ids is not None and len(ids) > 0:
            break

    if ids is None or len(ids) == 0:
        raise HTTPException(
            status_code=422,
            detail=f"ArUco markers not found (image size: {img.shape[1]}x{img.shape[0]})"
        )

    # 検出されたマーカーを {id: center_px} および {id: corners(4,2)} に変換
    detected: dict[int, np.ndarray] = {
        int(ids[i][0]): _marker_center(corners[i])
        for i in range(len(ids))
    }
    detected_corners: dict[int, np.ndarray] = {
        int(ids[i][0]): corners[i].reshape(4, 2)
        for i in range(len(ids))
    }

    # 床マット・壁マットのどちらをより多く検出しているか判定
    floor_found = {k: v for k, v in detected.items() if k in FLOOR_IDS}
    wall_found  = {k: v for k, v in detected.items() if k in WALL_IDS}
    markers = floor_found if len(floor_found) >= len(wall_found) else wall_found
    offset  = 0 if markers is floor_found else 4

    TL, TR, BL, BR = offset, offset+1, offset+2, offset+3

    # 対応するコーナーペアごとに pixels/cm を推定し平均を取る
    # 横ペア → 実距離 = mat_width_cm
    # 縦ペア → 実距離 = mat_height_cm
    estimates: list[float] = []

    if TL in markers and TR in markers:
        estimates.append(_dist(markers[TL], markers[TR]) / mat_width_cm)
    if BL in markers and BR in markers:
        estimates.append(_dist(markers[BL], markers[BR]) / mat_width_cm)
    if TL in markers and BL in markers:
        estimates.append(_dist(markers[TL], markers[BL]) / mat_height_cm)
    if TR in markers and BR in markers:
        estimates.append(_dist(markers[TR], markers[BR]) / mat_height_cm)

    if not estimates:
        raise HTTPException(
            status_code=422,
            detail=f"Need at least 2 corner markers from the same mat (found: {list(markers.keys())})"
        )

    pixels_per_cm = float(np.mean(estimates))
    h, w = img.shape[:2]

    # 4コーナーすべて揃っている場合はホモグラフィ行列を計算
    homography_matrix = None
    if all(cid in markers for cid in [TL, TR, BL, BR]):
        src_pts = np.float32([markers[TL], markers[TR], markers[BL], markers[BR]])
        dst_pts = np.float32([
            [0, 0],
            [mat_width_cm, 0],
            [0, mat_height_cm],
            [mat_width_cm, mat_height_cm],
        ])
        try:
            H = cv2.getPerspectiveTransform(src_pts, dst_pts)
            homography_matrix = H.flatten().tolist()
        except Exception:
            homography_matrix = None

    # 床マット＋壁マット両方が揃っている場合は solvePnP でカメラ姿勢を推定
    # マーカー中心の3D位置（原点=床-壁物理接合コーナー、M=5cm余白）
    M = 5.0
    W, H_mat = mat_width_cm, mat_height_cm
    CENTER_3D: dict[int, list[float]] = {
        0: [M,     M,     0.0],
        1: [M+W,   M,     0.0],
        2: [M,     M+H_mat, 0.0],
        3: [M+W,   M+H_mat, 0.0],
        4: [M,     0.0,   M+H_mat],
        5: [M+W,   0.0,   M+H_mat],
        6: [M,     0.0,   M],
        7: [M+W,   0.0,   M],
    }
    camera_pose = None
    floor_present = any(mid in detected for mid in FLOOR_IDS)
    wall_present  = any(mid in detected for mid in WALL_IDS)
    if floor_present and wall_present:
        obj_pts: list[list[float]] = []
        img_pts: list[list[float]] = []
        if marker_size_cm > 0:
            S = marker_size_cm / 2.0
            FLOOR_OFFSETS = [(-S, -S, 0.0), (+S, -S, 0.0), (+S, +S, 0.0), (-S, +S, 0.0)]
            WALL_OFFSETS  = [(-S, 0.0, +S), (+S, 0.0, +S), (+S, 0.0, -S), (-S, 0.0, -S)]
            for mid, c3d in CENTER_3D.items():
                if mid not in detected_corners:
                    continue
                offsets = FLOOR_OFFSETS if mid < 4 else WALL_OFFSETS
                for j, (ox, oy, oz) in enumerate(offsets):
                    obj_pts.append([c3d[0]+ox, c3d[1]+oy, c3d[2]+oz])
                    img_pts.append(detected_corners[mid][j].tolist())
        else:
            for mid, c3d in CENTER_3D.items():
                if mid in detected:
                    obj_pts.append(c3d)
                    img_pts.append(detected[mid].tolist())
        if len(obj_pts) >= 6:
            f_est = float(max(w, h))
            K_est = np.array([
                [f_est, 0.0,   w / 2.0],
                [0.0,   f_est, h / 2.0],
                [0.0,   0.0,   1.0],
            ], dtype=np.float64)
            try:
                ok, rvec, tvec = cv2.solvePnP(
                    np.float32(obj_pts), np.float32(img_pts),
                    K_est, None, flags=cv2.SOLVEPNP_ITERATIVE,
                )
                if ok:
                    R, _ = cv2.Rodrigues(rvec)
                    C_world = (-R.T @ tvec).flatten()
                    RT_Kinv = (R.T @ np.linalg.inv(K_est)).flatten()
                    camera_pose = {
                        "C":       C_world.tolist(),
                        "RT_Kinv": RT_Kinv.tolist(),
                    }
            except Exception:
                camera_pose = None

    return {
        "pixels_per_cm": round(pixels_per_cm, 4),
        "markers_found": len(markers),
        "pairs_used": len(estimates),
        "corners_normalized": [
            {"id": mid, "x": round(float(center[0] / w), 4), "y": round(float(center[1] / h), 4)}
            for mid, center in markers.items()
        ],
        "homography_matrix": homography_matrix,
        "camera_pose": camera_pose,
    }
