"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Upload, User, Activity, FileText, CheckCircle, AlertCircle, Plus, Trash2, Database } from "lucide-react";

export default function LaboratoryPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [patientId, setPatientId] = useState("");
  const [reportType, setReportType] = useState("General Blood Test");
  const [tests, setTests] = useState([
    { test_name: "Sugar", value: "", normal_range: "70-120", status: "NORMAL" },
    { test_name: "Hemoglobin", value: "", normal_range: "12-16", status: "NORMAL" }
  ]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const session = localStorage.getItem("clinical_session");
    if (!session) {
      router.push("/");
    } else {
      const parsed = JSON.parse(session);
      if (parsed.role !== "laboratory" && parsed.role !== "doctor") router.push("/");
      setUser(parsed);
      const savedPatientId = localStorage.getItem("active_patient_id");
      if (savedPatientId) setPatientId(savedPatientId);
    }
  }, [router]);

  useEffect(() => {
    fetchPendingRequests();
    if (patientId) {
      fetchReports();
    }
  }, [patientId]);
  const fetchReports = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/lab-reports/${patientId}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/lab-requests");
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data);
      }
    } catch (err) {
      console.error("Failed to fetch lab requests:", err);
    }
  };

  const handleGenerateReport = (request) => {
    setPatientId(request.patient_id);
    setReportType(request.test_type);
    setActiveRequestId(request.request_id);
    // Pre-fill tests with the requested type
    setTests([
      { test_name: request.test_type, value: "", normal_range: "", status: "NORMAL" }
    ]);
  };

  const generateDummyData = () => {
    const dummySets = [
      [
        { test_name: "Sugar", value: "145", normal_range: "70-120", status: "HIGH" },
        { test_name: "Hemoglobin", value: "11.2", normal_range: "12-16", status: "LOW" },
        { test_name: "Cholesterol", value: "180", normal_range: "<200", status: "NORMAL" }
      ],
      [
        { test_name: "WBC count", value: "11000", normal_range: "4500-11000", status: "NORMAL" },
        { test_name: "RBC count", value: "4.2", normal_range: "4.7-6.1", status: "LOW" },
        { test_name: "Platelets", value: "150000", normal_range: "150000-450000", status: "NORMAL" }
      ]
    ];
    const randomSet = dummySets[Math.floor(Math.random() * dummySets.length)];
    setTests(randomSet);
    setReportType("Standard Panel");
  };

  const addTestLine = () => {
    setTests([...tests, { test_name: "", value: "", normal_range: "", status: "NORMAL" }]);
  };

  const removeTestLine = (index) => {
    setTests(tests.filter((_, i) => i !== index));
  };

  const handleTestChange = (index, field, value) => {
    const newTests = [...tests];
    newTests[index][field] = value;
    setTests(newTests);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!patientId) {
      setError("Please enter a Patient ID");
      return;
    }
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("patient_id", patientId);
    formData.append("report_type", reportType);
    formData.append("lab_tests", JSON.stringify(tests));
    if (activeRequestId) formData.append("request_id", activeRequestId);
    if (file) formData.append("file", file);

    try {
      const res = await fetch("http://localhost:8000/api/upload-lab-report", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        alert("Lab report uploaded successfully!");
        setTests([
          { test_name: "Sugar", value: "", normal_range: "70-120", status: "NORMAL" },
          { test_name: "Hemoglobin", value: "", normal_range: "12-16", status: "NORMAL" }
        ]);
        setFile(null);
        setActiveRequestId(null);
        fetchReports();
        fetchPendingRequests();
      } else {
        throw new Error("Upload failed");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6">
      <nav className="max-w-6xl mx-auto mb-8 flex justify-between items-center bg-white border border-slate-200 p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <FlaskConical className="text-indigo-500 w-6 h-6" />
          <h1 className="font-bold text-slate-900 tracking-wide text-xl">Laboratory Workstation</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">Lab Technician ({user.user_id})</span>
          <button onClick={() => { localStorage.removeItem("clinical_session"); router.push("/"); }} className="text-sm text-red-400 hover:text-red-300">Logout</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pending Requests Section */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xl overflow-hidden mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-500" />
              Pending Lab Requests from Doctors
            </h2>
            
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-4">No pending lab requests at the moment.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400">
                      <th className="pb-3 font-medium">Patient ID</th>
                      <th className="pb-3 font-medium">Test Type</th>
                      <th className="pb-3 font-medium">Requested By</th>
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {pendingRequests.map((req) => (
                      <tr key={req.request_id} className="group hover:bg-slate-100/30 transition-colors">
                        <td className="py-4 font-mono text-indigo-400">{req.patient_id}</td>
                        <td className="py-4 text-slate-900 font-medium">{req.test_type}</td>
                        <td className="py-4 text-slate-500">{req.requested_by}</td>
                        <td className="py-4 text-slate-400">{req.date}</td>
                        <td className="py-4 text-right">
                          <button 
                            onClick={() => handleGenerateReport(req)}
                            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-semibold transition-all shadow-lg shadow-indigo-500/10"
                          >
                            Generate Report
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Upload Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-500" />
                Upload Lab Results
              </h2>
              <button 
                onClick={generateDummyData}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-indigo-400 px-3 py-1.5 rounded-lg border border-slate-300 font-medium transition-colors flex items-center gap-1.5"
              >
                <Database className="w-3.5 h-3.5" />
                Generate Dummy Data
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Patient ID</label>
                  <input 
                    type="text" 
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value.toUpperCase())}
                    placeholder="e.g. PAT-992"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Report Type</label>
                  <input 
                    type="text" 
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    placeholder="e.g. Blood Biochemistry"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-500">Test Metrics</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400">
                        <th className="pb-2 font-medium">Test Name</th>
                        <th className="pb-2 font-medium">Value</th>
                        <th className="pb-2 font-medium">Normal Range</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {tests.map((test, idx) => (
                        <tr key={idx} className="group">
                          <td className="py-2 pr-2">
                            <input 
                              type="text" 
                              value={test.test_name} 
                              onChange={(e) => handleTestChange(idx, "test_name", e.target.value)}
                              className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded p-1"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <input 
                              type="text" 
                              value={test.value} 
                              onChange={(e) => handleTestChange(idx, "value", e.target.value)}
                              className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded p-1"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <input 
                              type="text" 
                              value={test.normal_range} 
                              onChange={(e) => handleTestChange(idx, "normal_range", e.target.value)}
                              className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded p-1 text-slate-500"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <select 
                              value={test.status} 
                              onChange={(e) => handleTestChange(idx, "status", e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded p-1 text-xs"
                            >
                              <option value="NORMAL">NORMAL</option>
                              <option value="HIGH">HIGH</option>
                              <option value="LOW">LOW</option>
                              <option value="FAIL">FAIL</option>
                              <option value="PASS">PASS</option>
                            </select>
                          </td>
                          <td className="py-2 text-right">
                            <button type="button" onClick={() => removeTestLine(idx)} className="text-slate-400 hover:text-red-400">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button 
                  type="button" 
                  onClick={addTestLine}
                  className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-400 hover:text-indigo-400 hover:border-indigo-400 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-3 h-3" /> Add Test Metric
                </button>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Physical Report Attachment (Optional)</label>
                <input 
                  type="file" 
                  onChange={(e) => setFile(e.target.files[0])}
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-400 hover:file:bg-indigo-900/50"
                />
              </div>

              {error && <p className="text-red-400 text-sm text-center">{error}</p>}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium p-3.5 rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? "Uploading..." : <><CheckCircle className="w-5 h-5" /> Submit to Clinical Database</>}
              </button>
            </form>
          </div>
        </div>

        {/* Recent Reports Column */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xl overflow-hidden">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500" />
              Recent for {patientId || "..."}
            </h2>
            
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {reports.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Database className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No reports on record</p>
                </div>
              ) : (
                reports.map((rep, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4 hover:border-slate-400 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-indigo-400 uppercase">{rep.report_type}</span>
                      <span className="text-[10px] text-slate-400">{rep.date}</span>
                    </div>
                    <p className="text-xs text-slate-700 font-mono mb-2">ID: {rep.report_id}</p>
                    <div className="space-y-1">
                      {rep.lab_tests.slice(0, 2).map((test, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span className="text-slate-400">{test.test_name}</span>
                          <span className={test.status !== "NORMAL" ? "text-amber-500 font-bold" : "text-slate-700"}>
                            {test.value}
                          </span>
                        </div>
                      ))}
                      {rep.lab_tests.length > 2 && <p className="text-[10px] text-slate-400">+{rep.lab_tests.length - 2} more tests</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
