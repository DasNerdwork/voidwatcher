from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import api.db

app = FastAPI(title="VoidWatcher API", root_path="/api")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def api_index():
    return {"message": "VoidWatcher API läuft"}

@app.get("/top")
def top(hours: int = 24, limit: int = 10):
    try:
        last_updated = api.db.get_last_updated()
        top_perf = api.db.get_top_performers(hours, limit)
        top_seller = api.db.get_top_sellers(hours, limit)
        top_traded = api.db.get_most_traded(hours, limit)
        # datetime in ISO-String konvertieren
        for lst in (top_perf, top_seller, top_traded):
            for item in lst:
                item["datetime"] = item["datetime"].isoformat() if item["datetime"] else None
        return {
            "last_updated": last_updated,
            "top_performer": top_perf,
            "top_seller": top_seller,
            "top_traded": top_traded
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}
