import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.aruco import router as aruco_router
from app.api.mat_pdf import router as mat_pdf_router

app = FastAPI(title="OwnFeet Backend", version="0.1.0")

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(aruco_router, prefix="/api/v1")
app.include_router(mat_pdf_router, prefix="/api/v1")
