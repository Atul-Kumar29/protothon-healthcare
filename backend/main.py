from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import os
import requests
import json
import subprocess
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional
from google import genai

load_dotenv()

app = FastAPI(title="VeriTrust Health - Unified Clinical Gateway")

# Allow your teammates' Next.js frontend to talk to your laptop
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if GEMINI_API_KEY:
    genai_client = genai.Client(api_key=GEMINI_API_KEY)
else:
    genai_client = None

# Set up the staging folder where Apache Spark will look for new files
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'raw_clinical'))
os.makedirs(DATA_DIR, exist_ok=True)
USERS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'delta_users'))
os.makedirs(USERS_DIR, exist_ok=True)
AUDIT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'delta_lake_audit'))
os.makedirs(AUDIT_DIR, exist_ok=True)

# Define mock users (kept simple to avoid parquet/arrow issues for auth)
MOCK_USERS = [
    {"user_id": "DOC-001", "role": "doctor"},
    {"user_id": "PAT-992", "role": "patient"},
    {"user_id": "PHARM-01", "role": "pharmacy"},
]

class LoginRequest(BaseModel):
    user_id: str

class ClinicalApproval(BaseModel):
    patient_id: str
    symptoms: list[str]
    diagnosis: str
    medication: str
    dosage: str
    lab_tests: list[str]
    # Full conversation text (Doctor:/Patient: lines) for downstream AI
    raw_transcript: str


class PrescriptionRequest(BaseModel):
    conversation_text: str
    patient_id: Optional[str] = None

class UpdateStatusRequest(BaseModel):
    timestamp: str
    raw_transcript: str
    status: str

def trigger_spark_job():
    """Executes the Spark batch job inside the Docker container."""
    # Try different container names based on Docker Compose naming
    container_names = [
        "leakguard-ai-spark-master-1",
        "leakguard-ai-spark-master",
        "spark-master"
    ]
    
    for container_name in container_names:
        command = [
            "docker", "exec", "-u", "0", container_name,
            "spark-submit", "--packages", "io.delta:delta-spark_2.13:4.0.0",
            "/opt/bitnami/spark/data/processor.py"
        ]
        try:
            print(f"Triggering Spark Job on container {container_name}...")
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            print(f"Spark Job completed successfully: {result.stdout[:200]}")
            return True
        except subprocess.CalledProcessError as e:
            print(f"Spark Job failed on container {container_name}: {e.stderr[:200]}")
        except Exception as e:
            print(f"Error with container {container_name}: {e}")
    
    print("All container attempts failed. Spark job not triggered.")
    return False

@app.get("/")
def health_check():
    return {"status": "VeriTrust Health Backend is running!"}

@app.post("/api/login")
def login(req: LoginRequest):
    """Simple mock authentication against in-memory users."""
    for user in MOCK_USERS:
        if user["user_id"] == req.user_id:
            return {"status": "success", "user": user}
    raise HTTPException(status_code=401, detail="User not found")

@app.post("/upload-audio")
async def process_clinical_voice(
    source_lang: str = Form("hi-IN"),
    target_lang: str = Form("en-IN"),
    patient_id: str = Form("PAT-992"),
    speaker: str = Form("doctor"),
    file: UploadFile = File(...),
):
    """
    Receives audio and uses Sarvam for speech-to-text + translation.
    Returns a single transcript line suitable for building a Doctor:/Patient: conversation.
    """
    if not file.filename.endswith(('.wav', '.mp3', '.ogg', '.webm', '.m4a')):
        raise HTTPException(status_code=400, detail="Only audio files are allowed")
    
    audio_bytes = await file.read()
    print(f"[DEBUG] /upload-audio: speaker='{speaker}', src='{source_lang}', target='{target_lang}', patient='{patient_id}'")
    
    # 1. Call Sarvam AI's Speech-to-Text Translate API (Updated for current API)
    url = "https://api.sarvam.ai/speech-to-text-translate"
    headers = {"api-subscription-key": SARVAM_API_KEY}
    
    # Create a temporary file for the audio
    import tempfile
    import io
    
    # Write audio bytes to a BytesIO object first
    audio_stream = io.BytesIO(audio_bytes)
    
    try:
        # Use the correct file format for current Sarvam API
        files = {'file': (file.filename, audio_stream, file.content_type)}
        # Pass the target language requested by the frontend
        data = {
            'model': 'saaras:v2.5',
            'target_language_code': target_lang 
        }
        
        response = requests.post(url, headers=headers, files=files, data=data)
        response.raise_for_status()
        sarvam_result = response.json()

        # Extract the transcript (already translated into target_lang)
        transcript = sarvam_result.get("transcript", "")
        
        if not transcript:
            raise HTTPException(status_code=500, detail="Sarvam returned an empty transcript.")

        speaker_label = "Doctor" if speaker.lower() == "doctor" else "Patient"
        
        # 2. If target_lang is NOT English, we need to translate the English transcript
        # because saaras:v2.5 (STT-Translate) ONLY translates to English.
        final_transcript = transcript
        if target_lang != "en-IN":
            print(f"[DEBUG] Secondary translation needed: English -> {target_lang}")
            trans_url = "https://api.sarvam.ai/translate"
            trans_payload = {
                "input": transcript,
                "source_language_code": "en-IN",
                "target_language_code": target_lang,
                "model": "mayura:v1"
            }
            try:
                trans_res = requests.post(trans_url, json=trans_payload, headers=headers)
                trans_res.raise_for_status()
                final_transcript = trans_res.json().get("translated_text", transcript)
                print(f"[DEBUG] Translated text: {final_transcript[:50]}...")
            except Exception as trans_err:
                print(f"[DEBUG] Secondary translation failed: {trans_err}")

        line = f"{speaker_label}: {final_transcript}"

        # Return a single line so the frontend can build a conversation log
        return {
            "status": "success",
            "speaker": speaker_label,
            "raw_transcript": final_transcript,
            "line": line,
        }
        
    except requests.exceptions.RequestException as e:
        print(f"Sarvam API Error: {e.response.text if e.response else str(e)}")
        raise HTTPException(status_code=500, detail="Failed to connect to Sarvam AI.")

@app.post("/api/text-to-speech")
async def text_to_speech(req: dict):
    """
    Converts text to speech using Sarvam AI's Bulbul:v1 model.
    target_language: 'kn-IN', 'en-IN', 'hi-IN'
    """
    text = req.get("text")
    lang = req.get("language_code", "kn-IN")
    print(f"[DEBUG] /api/text-to-speech called. Text: {text[:50]}..., Lang: {lang}")
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    url = "https://api.sarvam.ai/text-to-speech"
    headers = {"api-subscription-key": SARVAM_API_KEY}
    
    # Using 'bulbul:v2' and a valid speaker as per latest Sarvam protocols
    payload = {
        "inputs": [text],
        "target_language_code": lang,
        "speaker": "anushka", # Valid speaker
        "pitch": 0,
        "pace": 1.0,
        "loudness": 1.5,
        "speech_sample_rate": 8000,
        "enable_preprocessing": True,
        "model": "bulbul:v2"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            print(f"[DEBUG] Sarvam TTS Error Response: {response.text}")
        response.raise_for_status()
        res_data = response.json()
        
        # Sarvam returns an array of base64 strings in 'audios'
        audios = res_data.get("audios", [])
        print(f"[DEBUG] Sarvam TTS Success. Received {len(audios)} audio strings.")
        audio_base64 = audios[0] if audios else ""
        
        return {"status": "success", "audio_base64": audio_base64}
        
    except requests.exceptions.RequestException as e:
        print(f"Sarvam TTS Error: {e.response.text if e.response else str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate speech via Sarvam AI.")

@app.post("/api/approve-clinical")
def approve_clinical_record(record: ClinicalApproval, background_tasks: BackgroundTasks):
    """Doctor approves JSON, saves to raw_clinical, triggers Spark"""
    file_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = os.path.join(DATA_DIR, f"clin_{file_id}.json")
    
    final_data = record.model_dump()
    final_data["timestamp"] = datetime.utcnow().isoformat()
    final_data["status"] = "pending_pharmacy"
    
    with open(file_path, "w") as f:
        json.dump(final_data, f, indent=4)
        
    background_tasks.add_task(trigger_spark_job)
    return {"status": "success", "message": "Record sent to Delta Lake"}


@app.post("/api/generate-prescription")
def generate_prescription(req: PrescriptionRequest):
    """
    Takes the full Doctor:/Patient: conversation text and (optionally) calls an LLM
    to extract structured clinical data. Falls back to a safe default when LLM
    is unavailable or quota-limited.
    """
    conversation_text = req.conversation_text or ""
    patient_id = req.patient_id

    # Retrieve patient history if available
    patient_history = ""
    if patient_id:
        try:
            history_records = []
            if os.path.exists(DATA_DIR):
                for filename in os.listdir(DATA_DIR):
                    if filename.endswith(".json"):
                        with open(os.path.join(DATA_DIR, filename), 'r') as f:
                            data = json.load(f)
                            if data.get("patient_id") == patient_id:
                                # Extract key clinical info for context
                                record_summary = {
                                    "date": data.get("timestamp", "Unknown"),
                                    "diagnosis": data.get("diagnosis", "N/A"),
                                    "medication": data.get("medication", "N/A"),
                                    "symptoms": data.get("symptoms", [])
                                }
                                history_records.append(record_summary)
            
            if history_records:
                # Sort by date and take last 3 for context
                # Assuming timestamp format is sortable or we convert it
                try:
                    history_records.sort(key=lambda x: x['date'], reverse=True)
                except:
                    pass
                patient_history = json.dumps(history_records[:3], indent=2)
        except Exception as e:
            print(f"Error retrieving patient history: {e}")

    # Base structure if no LLM or errors
    structured_info = {
        "symptoms": [],
        "diagnosis": "General consultation",
        "medication": "Paracetamol 500mg",
        "dosage": "1 tablet twice daily after food for 3 days",
        "lab_tests": [],
    }

    if genai_client and conversation_text and len(conversation_text.strip()) > 10:
        import re, time

        prompt = f"""You are a medical AI assistant. Extract structured clinical data from this doctor-patient conversation.
Consider the patient's medical history provided below to ensure clinical consistency.

### Patient History (Last 3 visits):
{patient_history if patient_history else "No previous records found."}

### Current Conversation:
{conversation_text}

Return ONLY a valid JSON object with these exact keys:
{{
  "symptoms": ["symptom1", "symptom2", ...],
  "diagnosis": "diagnosis description or 'Pending' if unclear",
  "medication": "medication name or 'None'",
  "dosage": "dosage instructions or 'None'",
  "lab_tests": ["test1", "test2", ...]
}}

If the conversation doesn't contain medical information or is too short, return:
{{
  "symptoms": [],
  "diagnosis": "Pending - insufficient information",
  "medication": "None",
  "dosage": "None",
  "lab_tests": []
}}

Return ONLY the JSON object, no other text."""

        # Try multiple models: primary and fallback, with retry on 429
        models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
        for model_name in models_to_try:
            success = False
            for attempt in range(2):
                try:
                    llm_res = genai_client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                    )
                    response_text = llm_res.text
                    json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
                    if json_match:
                        json_str = json_match.group(0)
                        try:
                            parsed_llm = json.loads(json_str)
                            structured_info.update(parsed_llm)
                            print(f"Prescription generated with {model_name}")
                        except json.JSONDecodeError:
                            print(f"Failed to parse LLM JSON: {json_str}")
                    else:
                        print(f"No JSON found in LLM response: {response_text[:200]}")
                    success = True
                    break  # Success — move on
                except Exception as e:
                    err_str = str(e)
                    if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                        wait_secs = 10 * (attempt + 1)
                        print(f"Gemini rate limited on {model_name} (attempt {attempt+1}). Retrying in {wait_secs}s...")
                        time.sleep(wait_secs)
                    else:
                        print(f"LLM Error with {model_name}: {e}")
                        break  # Non-retryable error, try next model
            if success:
                break  # Done — no need to try next model

    return {"status": "success", "structured_data": structured_info}

@app.get("/api/records")
def get_records(patient_id: Optional[str] = None, status: Optional[str] = None):
    """Reads clinical logs from Delta Lake, with raw_clinical fallback so new prescriptions still appear."""
    import glob
    import traceback

    # Start with an empty DataFrame
    df = pd.DataFrame()

    try:
        # 1. Read from Delta Lake parquet files if available
        if os.path.exists(AUDIT_DIR):
            parquet_files = glob.glob(os.path.join(AUDIT_DIR, "*.parquet"))

            if parquet_files:
                df_list = []
                for file in parquet_files:
                    try:
                        df_part = pd.read_parquet(file)
                        df_list.append(df_part)
                    except Exception as e:
                        print(f"Error reading {file}: {e}")

                if df_list:
                    df = pd.concat(df_list, ignore_index=True)
        # 2. Also read any raw_clinical JSON files as a fallback/source of truth
        raw_records = []
        if os.path.exists(DATA_DIR):
            for fname in os.listdir(DATA_DIR):
                if not fname.endswith(".json"):
                    continue
                fpath = os.path.join(DATA_DIR, fname)
                try:
                    with open(fpath, "r") as f:
                        rec = json.load(f)
                        raw_records.append(rec)
                except Exception as e:
                    print(f"Error reading raw_clinical file {fpath}: {e}")

        if raw_records:
            try:
                df_raw = pd.DataFrame(raw_records)
                if df is not None and not df.empty:
                    df = pd.concat([df, df_raw], ignore_index=True)
                else:
                    df = df_raw
            except Exception as e:
                print(f"Error building DataFrame from raw_clinical: {e}")
        
        if df is None or df.empty:
            return []

        if patient_id and "patient_id" in df.columns:
            df = df[df["patient_id"] == patient_id]

        if status and "status" in df.columns:
            df = df[df["status"] == status]

        if "timestamp" in df.columns:
            df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
            df = df.sort_values(by="timestamp", ascending=False)
            df["timestamp"] = df["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")

        # Drop duplicates and replace NaN/NaT with None so JSON is valid
        df = df.drop_duplicates(subset=["timestamp", "raw_transcript"])
        df = df.replace({pd.NA: None, float("nan"): None})
        
        return df.to_dict(orient="records")
    except Exception as e:
        print(f"Error reading records: {e}")
        return []

@app.get("/api/audits")
def get_audits():
    """Alias for /api/records to match frontend expectations."""
    return get_records()

@app.get("/api/debug/data")
def debug_data():
    """Debug endpoint to check data flow."""
    import glob
    import os
    
    debug_info = {
        "raw_clinical_files": [],
        "delta_lake_files": [],
        "records_count": 0,
        "audits_count": 0
    }
    
    # Check raw_clinical directory
    raw_clinical_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'raw_clinical')
    if os.path.exists(raw_clinical_path):
        debug_info["raw_clinical_files"] = os.listdir(raw_clinical_path)
    
    # Check delta_lake_audit directory
    delta_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'delta_lake_audit')
    if os.path.exists(delta_path):
        parquet_files = glob.glob(os.path.join(delta_path, "*.parquet"))
        debug_info["delta_lake_files"] = [os.path.basename(f) for f in parquet_files]
    
    # Get record counts
    records = get_records()
    debug_info["records_count"] = len(records)
    debug_info["audits_count"] = len(records)  # Same as records
    
    return debug_info

@app.post("/api/update-status")
def update_status(req: UpdateStatusRequest):
    """Pharmacy dispensing updates status"""
    try:
        if not os.path.exists(AUDIT_DIR):
            return {"status": "error", "message": "No Delta Lake"}
            
        df = pd.read_parquet(AUDIT_DIR)
        
        # Update matching row
        mask = (df["timestamp"].astype(str).str.contains(req.timestamp.split()[0])) & (df["raw_transcript"] == req.raw_transcript)
        if mask.any():
            df.loc[mask, "status"] = req.status
            # Overwrite the parquet file
            df.to_parquet(AUDIT_DIR, partition_cols=None)
            return {"status": "success", "message": f"Updated to {req.status}"}
            
        return {"status": "error", "message": "Record not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Running on 0.0.0.0 exposes this to your local network
    uvicorn.run(app, host="0.0.0.0", port=8000)