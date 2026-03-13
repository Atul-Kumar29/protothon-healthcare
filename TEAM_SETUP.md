# Team Setup Guide: Running LeakGuard AI Locally

Since certain configuration files (`.env`) and dependency folders (`node_modules`, `venv`) are excluded from Git, each teammate needs to perform these steps manually after cloning the repository.

---

## 1. Prerequisites
Ensure you have the following installed:
- **Docker & Docker Compose** (for Spark/Airflow/Postgres)
- **Python 3.8+**
- **Node.js 18+ & npm**

---

## 2. Setting up the Backend

### A. Environment Variables
The `.env` file is ignored by Git for security. You must create one manually:
1. Navigate to the `backend` directory: `cd backend`
2. Create a new file named `.env`.
3. Add the following keys (ask the team lead for the actual keys):
   ```env
   SARVAM_API_KEY = your_sarvam_key_here
   GEMINI_API_KEY = your_gemini_key_here
   ```

### B. Virtual Environment & Dependencies
1. Create a virtual environment:
   ```bash
   # Windows
   python -m venv venv
   .\venv\Scripts\activate

   # Mac/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

---

## 3. Setting up the Frontend

1. Navigate to the `frontend` directory: `cd ../frontend`
2. Install Node.js dependencies:
   ```bash
   npm install
   ```

---

## 4. Starting the Infrastructure (Docker)

The system relies on Apache Spark and Airflow running in Docker for data processing.
1. From the project root, run:
   ```bash
   docker-compose up -d
   ```
2. Verify containers are running: `docker ps`

---

## 5. Running the Application

To start the system, you need **two terminal windows** (or use background processes):

### Terminal 1: Backend API
```bash
cd backend
# Ensure venv is activated
python main.py
```
*API will be available at: http://localhost:8000*

### Terminal 2: Frontend Dashboard
```bash
cd frontend
npm run dev
```
*Dashboard will be available at: http://localhost:3000/doctor*

---

## Troubleshooting
- **Frontend can't see Backend:** Ensure the backend is running on port 8000 before starting the frontend.
- **Gemini Errors:** Ensure your `GEMINI_API_KEY` is valid and you are not hitting the free-tier rate limits (wait 1 minute if you see 429 errors).
- **Docker Ports:** Ensure ports 8080 (Airflow) and 8081 (Spark) are not being used by other applications.
