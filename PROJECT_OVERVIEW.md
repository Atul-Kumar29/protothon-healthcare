# LeakGuard AI Project Overview

This document provides a high-level overview of the LeakGuard AI project. Ensure you read this document to understand the project's architecture, tech stack, and data flow before suggesting further steps or modifications.

## Core Objective

LeakGuard AI is a hackathon project built for Discover Dollar. It's a system designed to process audio logs (such as warehouse Goods Receipt Notes or GRNs), translate and transcribe them, process the transcripts to detect potential leaks or fraud, and display the results in a real-time admin dashboard tailored for financial auditors.

## Tech Stack Overview

1.  **Frontend**: Next.js (App Router), Vanilla React, Tailwind CSS, `lucide-react` icons.
2.  **Backend API**: Python FastAPI (running locally on port 8000).
3.  **External AI Service**: Sarvam AI (Speech-to-Text API) for audio translation and transcription.
4.  **Data Processing Engine**: Apache Spark (PySpark) running inside a local Docker container (`leakguard-ai-spark-master-1`).
5.  **Data Storage layer**: Delta Lake / Parquet formats stored via Docker volumes.

## Directory Structure

*   `backend/` - Contains the FastAPI application logic, including the audio upload endpoint and Parquet data retrieval.
    *   `main.py` - The core application entry point.
*   `frontend/` - Contains the Next.js React application.
    *   `app/dashboard/page.js` - The main UI displaying the processed audit logs.
*   `data/` - (Auto-created mapping) Local volume bridging Python API and Docker Spark.
    *   `raw_grn/` - Where the FastAPI saves JSON transcripts temporarily.
    *   `delta_lake_audit/` - The final destination where the Spark job writes processed Parquet files with risk scores and boolean leak flags.
*   `dags/` / `docker-compose.yml` - PySpark container provisioning files.

## Data Flow Pipeline

1.  **Audio Upload**: An audio file (.wav, .mp3) is uploaded to `POST /upload-audio` (FastAPI).
2.  **Transcription**: FastAPI makes a synchronous request to the Sarvam AI web API, which transcribes the audio into English text.
3.  **LLM Processing**: The transcript is processed by Google Gemini LLM to extract structured clinical data (symptoms, diagnosis, medication, etc.).
4.  **Temporary Staging**: A structured JSON object containing the clinical data is persisted locally in `data/raw_clinical/`.
5.  **PySpark Job Trigger**: FastAPI executes a background task to trigger a PySpark script inside the running Docker container.
6.  **Processing**: The Spark job reads the JSON clinical data and saves it to a Delta Lake table locally in `data/delta_lake_audit/`.
7.  **Admin Review**: A user navigating to the Next.js UI on `http://localhost:3000/dashboard` triggers a React `useEffect` to fetch `GET /api/audits`.
8.  **Data Retrieval**: FastAPI retrieves the latest Parquet files using the `pandas` library, filtering out duplicates, and serves the clinical records back to the UI.
9.  **UI Rendering**: The Next.js dashboard displays clinical records with status tracking (pending_pharmacy, dispensed, etc.).
