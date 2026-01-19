import React, { useState, useEffect } from 'react';
import { oauth2 as SMART } from 'fhirclient';
import axios from 'axios';
import { Upload, FileCheck, AlertCircle, Loader2 } from 'lucide-react';

const AZURE_ANALYSIS_ENDPOINT = "https://your-azure-service.com/analyze";

export default function SmartEegApp() {
  const [fhirClient, setFhirClient] = useState(null);
  const [patient, setPatient] = useState(null);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, uploading, analyzing, saving, success, error
  const [seaIndex, setSeaIndex] = useState(null);

  // 1. 初始化 SMART on FHIR 連結
  useEffect(() => {
    SMART.ready()
      .then(client => {
        setFhirClient(client);
        return client.patient.read();
      })
      .then(res => setPatient(res))
      .catch(err => console.error("SMART Auth Error:", err));
  }, []);

  // 2. 處理檔案選擇
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.name.endsWith('.gz')) {
      setFile(selectedFile);
      setStatus('idle');
    } else {
      alert("請選擇正確的 .gz 格式腦波檔案");
    }
  };

  // 3. 核心流程：上傳 Azure -> 取得 SEA Index -> 寫入 FHIR
  const processEegData = async () => {
    if (!file || !fhirClient) return;

    try {
      setStatus('uploading');
      
      // A. 上傳至 Azure API
      const formData = new FormData();
      formData.append('file', file);
      
      const azureRes = await axios.post(AZURE_ANALYSIS_ENDPOINT, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // 假設 Azure 回傳格式為 { "seaIndex": 0.85 }
      const resultValue = azureRes.data.seaIndex;
      setSeaIndex(resultValue);
      setStatus('saving');

      // B. 封裝為 FHIR Observation 資源
      const observation = {
        resourceType: "Observation",
        status: "final",
        category: [{
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "procedure" }]
        }],
        code: {
          coding: [{ 
            system: "http://clinical-indices.org", 
            code: "SEA-INDEX", 
            display: "Subclinical Epileptiform Activity Index" 
          }]
        },
        subject: { reference: `Patient/${fhirClient.patient.id}` },
        effectiveDateTime: new Date().toISOString(),
        valueQuantity: {
          value: resultValue,
          unit: "index",
          system: "http://unitsofmeasure.org",
          code: "1"
        },
        device: { display: "Azure EEG Analysis Engine" }
      };

      // C. 寫回 FHIR Server
      await fhirClient.create(observation);
      setStatus('success');

    } catch (error) {
      console.error("Processing Error:", error);
      setStatus('error');
    }
  };

  if (!patient) return <div className="p-10 text-center">正在連接 EHR 系統...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">EEG Analysis Dashboard</h1>
          <p className="text-slate-500">患者: <span className="font-semibold text-blue-600">{patient.name[0].given.join(' ')} {patient.name[0].family}</span> (ID: {patient.id})</p>
        </header>

        {/* 檔案上傳區 */}
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center hover:bg-slate-50 transition-colors">
          <input type="file" id="file-upload" className="hidden" onChange={handleFileChange} accept=".gz" />
          <label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <p className="text-lg font-medium">{file ? file.name : "點擊或拖放腦波檔案 (.gz)"}</p>
          </label>
        </div>

        {/* 狀態與按鈕 */}
        <div className="mt-8 space-y-4">
          {status === 'idle' && file && (
            <button onClick={processEegData} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-all">
              開始分析並同步至 FHIR
            </button>
          )}

          {['uploading', 'analyzing', 'saving'].includes(status) && (
            <div className="flex items-center justify-center p-4 bg-blue-50 text-blue-700 rounded-lg">
              <Loader2 className="animate-spin mr-2" />
              <span>正在{status === 'uploading' ? '上傳檔案...' : status === 'analyzing' ? '雲端分析中...' : '儲存至 FHIR 伺服器...'}</span>
            </div>
          )}

          {status === 'success' && (
            <div className="flex items-center p-4 bg-green-50 text-green-700 rounded-lg">
              <FileCheck className="mr-2" />
              <span>分析完成！SEA Index: <strong>{seaIndex}</strong> 已同步至病歷。</span>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-center p-4 bg-red-50 text-red-700 rounded-lg">
              <AlertCircle className="mr-2" />
              <span>程序出錯，請檢查 Azure 服務或網路連線。</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}