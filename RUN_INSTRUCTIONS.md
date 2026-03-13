# LeakGuard AI - Run Instructions

## Project Overview
LeakGuard AI is a clinical voice log processing system that:
1. Accepts audio files (medical consultations)
2. Transcribes them using Sarvam AI
3. Extracts structured clinical data using Google Gemini
4. Processes data through Apache Spark
5. Displays results in a dashboard

## Prerequisites
- Docker and Docker Compose
- Python 3.8+
- Node.js 18+ and npm
- Sarvam AI API key (in `backend/.env`)
- Google Gemini API key (in `backend/.env`)

## Quick Start

### 1. Start Docker Services
```bash
docker-compose up -d
```

This starts:
- Apache Spark (master + worker)
- PostgreSQL for Airflow
- Apache Airflow (webserver + scheduler)

### 2. Install Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 3. Install Frontend Dependencies
```bash
cd frontend
npm install
```

### 4. Start Backend API
```bash
cd backend
python main.py
```
Or use the provided script:
```bash
python start_services.py
```

### 5. Start Frontend
```bash
cd frontend
npm run dev
```

## Service URLs
- **Backend API**: http://localhost:8000
- **Frontend Dashboard**: http://localhost:3000/dashboard
- **Airflow UI**: http://localhost:8080 (admin/admin)
- **Spark Master UI**: http://localhost:8081

## API Endpoints

### Backend API (FastAPI)
- `GET /` - Health check
- `POST /upload-audio` - Upload audio file for processing
- `POST /api/login` - User authentication
- `POST /api/approve-clinical` - Doctor approval endpoint
- `GET /api/records` - Get clinical records
- `GET /api/audits` - Alias for /api/records (frontend compatibility)
- `POST /api/update-status` - Update record status

### Data Flow
1. Upload audio file to `/upload-audio`
2. Audio is transcribed by Sarvam AI
3. Transcript is processed by Google Gemini for clinical data extraction
4. Doctor approves data via `/api/approve-clinical`
5. Data is saved to `data/raw_clinical/` and Spark job is triggered
6. Spark processes data and saves to Delta Lake (`data/delta_lake_audit/`)
7. Dashboard displays records from Delta Lake

## Testing the Pipeline

### 1. Test Sarvam API
```bash
python backend/test_sarvam_updated.py
```

### 2. Test Full Pipeline
```bash
python test_pipeline.py
```

### 3. Upload Test Audio
Use a tool like curl or Postman to upload an audio file:
```bash
curl -X POST http://localhost:8000/upload-audio \
  -F "file=@path/to/audio.wav" \
  -F "patient_id=PAT-992"
```

## Troubleshooting

### Common Issues

1. **Sarvam API Errors**
   - Check `backend/.env` has valid `SARVAM_API_KEY`
   - Test with `python backend/test_sarvam_updated.py`

2. **Spark Job Not Triggering**
   - Check Docker containers are running: `docker ps`
   - Verify container name in `trigger_spark_job()` function

3. **Frontend Can't Connect to Backend**
   - Ensure backend is running on port 8000
   - Check CORS settings in `backend/main.py`

4. **No Data in Dashboard**
   - Check if Spark processed data: look for Parquet files in `data/delta_lake_audit/`
   - Verify data flow: upload → approval → Spark processing

### Docker Commands
```bash
# Check running containers
docker ps

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Stop all services
docker-compose down
```

## Project Structure
```
leakguard-ai/
├── backend/           # FastAPI backend
│   ├── main.py       # Main application
│   ├── .env          # API keys
│   └── requirements.txt
├── frontend/         # Next.js frontend
│   ├── app/dashboard/page.js
│   └── package.json
├── data/             # Data storage
│   ├── raw_clinical/ # Raw JSON files
│   └── delta_lake_audit/ # Processed Parquet files
├── dags/             # Airflow DAGs
├── docker-compose.yml
└── PROJECT_OVERVIEW.md
```

## Notes
- The project has been updated to use current Sarvam API protocols
- Risk score and leak detection have been removed as per requirements
- Focus is on clinical data processing and status tracking
- All API endpoints are documented in `backend/main.py`