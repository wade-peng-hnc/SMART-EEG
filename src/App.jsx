import { useCallback, useEffect, useMemo, useState } from 'react'
import FHIR from 'fhirclient'
import axios from 'axios'
import {
  UploadCloud,
  FileCheck2,
  AlertTriangle,
  Loader2,
  UserRound,
  Activity,
  ShieldCheck,
  User,
  Lock,
  Eye,
  EyeOff,
  Radar,
} from 'lucide-react'
import hncLogo from './assets/HNC_Logo.png'
import hncLogoEn from './assets/HNC_Logo_EN.png'
import './App.css'

const AZURE_BASE_URL =
  import.meta.env.VITE_AZURE_BASE_URL || 'https://hncseasystem.com/sea/v2'
const AZURE_LOGIN_URL =
  import.meta.env.VITE_AZURE_LOGIN_URL || `${AZURE_BASE_URL}/login/`
const AZURE_EEGDATA_URL =
  import.meta.env.VITE_AZURE_EEGDATA_URL || `${AZURE_BASE_URL}/eegdata/`
const AZURE_SEASCORE_URL =
  import.meta.env.VITE_AZURE_SEASCORE_URL || `${AZURE_BASE_URL}/seascore/`
const SMART_CLIENT_ID = import.meta.env.VITE_SMART_CLIENT_ID
const SMART_REDIRECT_URI =
  import.meta.env.VITE_SMART_REDIRECT_URI ||
  `${window.location.origin}${window.location.pathname}`
const SMART_SCOPE =
  import.meta.env.VITE_SMART_SCOPE ||
  'launch openid fhirUser profile patient/*.read'
const TWCORE_OBS_PROFILE =
  import.meta.env.VITE_TWCORE_OBS_PROFILE ||
  'https://twcore.mohw.gov.tw/ig/twcore/StructureDefinition/Observation-simple-twcore'
const SEA_LOINC_PRIMARY_CODE =
  import.meta.env.VITE_SEA_LOINC_PRIMARY_CODE || '86585-7'
const SEA_LOINC_SECONDARY_CODE =
  import.meta.env.VITE_SEA_LOINC_SECONDARY_CODE || '96763-8'
const SEA_LOINC_PRIMARY_DISPLAY =
  import.meta.env.VITE_SEA_LOINC_PRIMARY_DISPLAY ||
  'MDS v3.0 - RAI v1.17.2, OASIS E - Signs and symptoms of delirium (from CAM) during assessment period [CMS Assessment]'
const SEA_LOINC_SECONDARY_DISPLAY =
  import.meta.env.VITE_SEA_LOINC_SECONDARY_DISPLAY ||
  'SARS-CoV-2 (COVID-19) E gene [Presence] in Respiratory system specimen by NAA with probe detection'
const SEA_CODE_TEXT = import.meta.env.VITE_SEA_CODE_TEXT || 'SEA Index'

function App() {
  const [client, setClient] = useState(null)
  const [ready, setReady] = useState(false)
  const [authError, setAuthError] = useState('')
  const [patientId, setPatientId] = useState('')
  const [patientInfo, setPatientInfo] = useState(null)

  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)

  const [uploadProgress, setUploadProgress] = useState(0)
  const [statusText, setStatusText] = useState('等待上傳 .gz 檔案')
  const [analyzing, setAnalyzing] = useState(false)

  const [seaIndex, setSeaIndex] = useState(null)
  const [fhirWriteStatus, setFhirWriteStatus] = useState('')
  const [fhirWriteErrorCode, setFhirWriteErrorCode] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [metadataStatus, setMetadataStatus] = useState('')
  const [csvMetadata, setCsvMetadata] = useState(null)
  const [csvError, setCsvError] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const [azureUsername, setAzureUsername] = useState('')
  const [azurePassword, setAzurePassword] = useState('')
  const [azureToken, setAzureToken] = useState('')
  const [azureLoginStatus, setAzureLoginStatus] = useState('')
  const [azureLoginError, setAzureLoginError] = useState('')
  const [azureLoginLoading, setAzureLoginLoading] = useState(false)
  const [seaScoreElapsed, setSeaScoreElapsed] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [lastObservation, setLastObservation] = useState(null)

  useEffect(() => {
    if (!analyzing) return undefined
    const timer = setInterval(() => {
      setSeaScoreElapsed((prev) => (prev < 50 ? prev + 1 : prev))
    }, 1000)
    return () => clearInterval(timer)
  }, [analyzing])

  useEffect(() => {
    let mounted = true

    const params = new URLSearchParams(window.location.search)
    const iss = params.get('iss')
    const launch = params.get('launch')

    if (iss || launch) {
      if (!SMART_CLIENT_ID) {
        setAuthError('SMART on FHIR 缺少 Client ID 設定。')
        return () => {
          mounted = false
        }
      }
      FHIR.oauth2.authorize({
        clientId: SMART_CLIENT_ID,
        scope: SMART_SCOPE,
        redirectUri: SMART_REDIRECT_URI,
        iss,
        pkce: true,
      })
      return () => {
        mounted = false
      }
    }

    FHIR.oauth2
      .ready()
      .then((c) => {
        if (!mounted) return
        setClient(c)
        setReady(true)
        return c.patient.read()
      })
      .then((p) => {
        if (!mounted || !p) return
        setPatientId(p.id || '')
        const name = p.name?.[0]
        const given = Array.isArray(name?.given) ? name.given.join(' ') : ''
        const displayName = name?.text || `${given} ${name?.family || ''}`.trim()
        setPatientInfo({
          id: p.id || '',
          name: displayName || '未提供姓名',
          gender: p.gender || '未提供',
          birthDate: p.birthDate || '未提供',
        })
      })
      .catch((err) => {
        if (!mounted) return
        const status = err?.status || err?.response?.status
        if (status === 401 || status === 403) {
          setAuthError('授權已過期或沒有權限，請重新登入。')
        } else {
          setAuthError('SMART on FHIR 尚未啟動。')
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  const signalQualityDisplay = useMemo(() => {
    const raw = csvMetadata?.signal_quality_score
    if (raw === undefined || raw === null || raw === '') return '-'
    const num = Number.parseFloat(raw)
    if (Number.isNaN(num)) return String(raw)
    return num.toFixed(2)
  }, [csvMetadata])

  const resetStatus = useCallback(() => {
    setUploadProgress(0)
    setAnalyzing(false)
    setSeaIndex(null)
    setFhirWriteStatus('')
    setFhirWriteErrorCode(null)
    setErrorMessage('')
    setMetadataStatus('')
    setCsvMetadata(null)
    setCsvError('')
    setCsvFileName('')
    setSeaScoreElapsed(0)
    setStatusText('等待上傳 .gz 檔案')
  }, [])

  const validateFile = useCallback((f) => {
    if (!f) return '請選擇 .gz 檔案'
    if (!f.name.toLowerCase().endsWith('.gz')) {
      return '檔案格式錯誤，請上傳 .gz 壓縮檔'
    }
    return ''
  }, [])

  const decompressGzipToText = async (gzipFile) => {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('瀏覽器不支援 gzip 解壓')
    }
    const stream = gzipFile.stream().pipeThrough(new DecompressionStream('gzip'))
    const response = new Response(stream)
    return response.text()
  }

  const parseMetadataFromCsv = (text) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
    const targetKeys = [
      'SubjectID',
      'Age',
      'Gender',
      'Drug',
      'PHQ-9',
      'Time',
      'signal_quality_score',
    ]
    const metadata = {}
    const first13 = lines.slice(0, 13)

    const headerLine = first13[0] || ''
    const headerParts = headerLine.split(',').map((part) => part.trim())
    const isHeaderRow = targetKeys.every((key) => headerParts.includes(key))

    if (isHeaderRow && first13[1]) {
      const values = first13[1].split(',').map((part) => part.trim())
      headerParts.forEach((key, idx) => {
        if (targetKeys.includes(key)) {
          metadata[key] = values[idx] ?? ''
        }
      })
    } else {
      first13.forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed) return
        const delimiter = trimmed.includes(',') ? ',' : trimmed.includes(':') ? ':' : '\t'
        const parts = trimmed.split(delimiter).map((part) => part.trim())
        if (parts.length < 2) return
        const key = parts[0]
        const value = parts.slice(1).join(' ').trim()
        if (targetKeys.includes(key)) {
          metadata[key] = value
        }
      })
    }

    return metadata
  }

  const handleFileSelected = useCallback(
    async (f) => {
      resetStatus()
      const error = validateFile(f)
      if (error) {
        setErrorMessage(error)
        setFile(null)
        return
      }
      setFile(f)
      setStatusText('已選擇檔案，準備上傳')
      setMetadataStatus('解壓縮與解析中...')
      try {
        const csvText = await decompressGzipToText(f)
        const metadata = parseMetadataFromCsv(csvText)
        const convertedName = f.name.replace(/\.gz$/i, '.csv')
        setCsvFileName(convertedName)
        setCsvMetadata(metadata)
        setMetadataStatus('已完成基本資訊解析')
      } catch (err) {
        setCsvError(err?.message || '解壓縮或解析失敗')
        setMetadataStatus('解析失敗')
      }
    },
    [resetStatus, validateFile]
  )

  const handleAzureLogin = useCallback(async () => {
    setAzureLoginError('')
    setAzureLoginStatus('')
    if (!azureUsername || !azurePassword) {
      setAzureLoginError('請輸入帳號與密碼')
      return
    }

    setAzureLoginLoading(true)
    try {
      let res
      try {
        res = await axios.post(AZURE_LOGIN_URL, {
          username: azureUsername,
          password: azurePassword,
          renew_token: true,
        })
      } catch (loginErr) {
        const status = loginErr?.response?.status
        if (status !== 415 && status !== 400) {
          throw loginErr
        }
        const formBody = new URLSearchParams({
          username: azureUsername,
          password: azurePassword,
          renew_token: 'true',
        })
        res = await axios.post(AZURE_LOGIN_URL, formBody, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      }
      const token = res.data?.token || res.data?.access_token || ''
      if (!token) {
        throw new Error('登入回應缺少 token')
      }
      setAzureToken(token)
      setAzurePassword('')
      setAzureLoginStatus('登入成功')
    } catch (err) {
      const status = err?.response?.status
      if (status === 401 || status === 403) {
        setAzureLoginError('帳號或密碼錯誤，請重新登入')
      } else {
        setAzureLoginError('登入失敗，請稍後再試')
      }
    } finally {
      setAzureLoginLoading(false)
    }
  }, [azureUsername, azurePassword])

  const handleAzureLogout = useCallback(() => {
    setAzureToken('')
    setAzureLoginStatus('')
    setAzureLoginError('')
  }, [])

  const azureHeaders = useMemo(() => {
    if (!azureToken) return undefined
    return { Authorization: azureToken }
  }, [azureToken])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }, [])

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      const dropped = e.dataTransfer?.files?.[0]
      handleFileSelected(dropped || null)
    },
    [handleFileSelected]
  )

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const pollSeaScore = async (medicalNumber, dataNo, headers, onTick) => {
    for (let i = 0; i < 8; i += 1) {
      await sleep(5000)
      const res = await axios.get(
        `${AZURE_SEASCORE_URL}${encodeURIComponent(medicalNumber)}/${dataNo}`,
        { headers }
      )
      if (onTick) onTick((i + 1) * 5)
      if (res.data?.code === 0) return res.data
    }
    throw new Error('SEA score 取得超時，請稍後再試')
  }

  const writeSeaIndexObservation = async (value) => {
    if (!client || !patientId) {
      throw new Error('FHIR 用戶端尚未就緒')
    }

    const rawUserRef =
      (typeof client.getUserId === 'function' && client.getUserId()) ||
      client.user?.id ||
      ''
    const performerRef = rawUserRef.includes('/')
      ? rawUserRef
      : client.user?.resourceType && rawUserRef
        ? `${client.user.resourceType}/${rawUserRef}`
        : `Patient/${patientId}`

    const observation = {
      resourceType: 'Observation',
      meta: {
        profile: [TWCORE_OBS_PROFILE],
      },
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'survey',
              display: 'Survey',
            },
          ],
          text: 'Survey',
        },
      ],
      text: {
        status: 'generated',
        div: `<div xmlns="http://www.w3.org/1999/xhtml">SEA Index: ${value}</div>`,
      },
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: SEA_LOINC_PRIMARY_CODE,
            display: SEA_LOINC_PRIMARY_DISPLAY,
          },
          {
            system: 'http://loinc.org',
            code: SEA_LOINC_SECONDARY_CODE,
            display: SEA_LOINC_SECONDARY_DISPLAY,
          },
          {
            system: 'http://clinical-indices.org',
            code: 'SEA-INDEX',
            display: SEA_CODE_TEXT,
          },
        ],
        text: SEA_CODE_TEXT,
      },
      subject: { reference: `Patient/${patientId}` },
      performer: [{ reference: performerRef }],
      effectiveDateTime: new Date().toISOString(),
      valueQuantity: {
        value,
        unit: 'index',
        system: 'http://unitsofmeasure.org',
        code: '1',
      },
    }

    const serverUrl = client.state?.serverUrl
    const accessToken = client.state?.tokenResponse?.access_token
    if (!serverUrl || !accessToken) {
      throw new Error('FHIR 授權資訊缺失')
    }

    setLastObservation(observation)
    const res = await fetch(`${serverUrl}/Observation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/fhir+json',
        Accept: 'application/fhir+json',
      },
      body: JSON.stringify(observation),
    })

    if (!res.ok) {
      let outcome = null
      try {
        outcome = await res.json()
      } catch {
        outcome = null
      }
      const error = new Error('FHIR write failed')
      error.status = res.status
      error.response = outcome
      throw error
    }
  }

  const handleDownloadObservation = useCallback(() => {
    if (!lastObservation) return
    const blob = new Blob([JSON.stringify(lastObservation, null, 2)], {
      type: 'application/fhir+json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'sea-index-observation.json'
    link.click()
    URL.revokeObjectURL(url)
  }, [lastObservation])

  const handleUpload = useCallback(async () => {
    if (!file) {
      setErrorMessage('請先選擇 .gz 檔案')
      return
    }

    const error = validateFile(file)
    if (error) {
      setErrorMessage(error)
      return
    }

    setErrorMessage('')
    setStatusText('上傳中...')
    setAnalyzing(true)
    setSeaScoreElapsed(0)

    try {
      const medicalNumber = csvMetadata?.SubjectID || ''
      if (!medicalNumber) {
        throw new Error('缺少 SubjectID，無法上傳')
      }
      const age = Number.parseInt(csvMetadata?.Age || '', 10)
      const phq9Score = Number.parseInt(csvMetadata?.['PHQ-9'] || '', 10)
      const signalQualityScore = Number.parseFloat(
        csvMetadata?.signal_quality_score || ''
      )
      const formData = new FormData()
      formData.append('medicalNumber', String(medicalNumber))
      formData.append('document', file)
      if (!Number.isNaN(age)) formData.append('age', String(age))
      if (csvMetadata?.Gender) formData.append('gender', String(csvMetadata.Gender))
      if (!Number.isNaN(phq9Score)) {
        formData.append('phq9_score', String(phq9Score))
      }
      if (csvMetadata?.Drug) formData.append('drug', String(csvMetadata.Drug))
      formData.append('techRemarks', '')
      formData.append('comprehensiveResult', '')
      if (!Number.isNaN(signalQualityScore)) {
        formData.append('signal_quality_score', String(signalQualityScore))
      }
      formData.append('is_fine_signal_quality', 'false')

      const res = await axios.post(AZURE_EEGDATA_URL, formData, {
        headers: {
          ...(azureHeaders || {}),
        },
        onUploadProgress: (evt) => {
          if (!evt.total) return
          const percent = Math.round((evt.loaded / evt.total) * 100)
          setUploadProgress(percent)
        },
      })
      setUploadProgress(100)
      const dataNo = res.data?.data_no
      if (!dataNo) {
        throw new Error('上傳成功但缺少 data_no')
      }

      setStatusText('計算 SEA Index 中...')
      const seaScore = await pollSeaScore(medicalNumber, dataNo, azureHeaders, (seconds) => {
        setSeaScoreElapsed(seconds)
        if (seconds >= 20) {
          setStatusText('取得 SEA Index 中...')
        } else {
          setStatusText('計算 SEA Index 中...')
        }
      })
      const finalSeaIndex =
        seaScore?.seaScore ?? seaScore?.seaIndex ?? seaScore?.result?.seaIndex
      if (typeof finalSeaIndex === 'number') {
        setSeaIndex(finalSeaIndex)
      }
      setSeaScoreElapsed(50)

      const canWriteFhir = ready && !authError && client && patientId
      if (canWriteFhir) {
        setStatusText('分析完成，寫入 FHIR 中...')
      } else {
        setStatusText('分析完成')
      }

      try {
        if (typeof finalSeaIndex === 'number' && canWriteFhir) {
          await writeSeaIndexObservation(finalSeaIndex)
          setFhirWriteStatus('已成功寫入 FHIR Observation')
        } else if (typeof finalSeaIndex !== 'number') {
          setFhirWriteStatus('未取得 SEA Index，略過 FHIR 寫入')
        }
      } catch (err) {
        const status = err?.status || err?.response?.status
        setFhirWriteErrorCode(status || null)
        setFhirWriteStatus('FHIR 寫入失敗')
      }

      setStatusText('流程完成')
    } catch (err) {
      const status = err?.response?.status
      if (status === 400) {
        setErrorMessage('檔案損壞或格式錯誤，請確認 .gz 檔案')
      } else if (status === 401 || status === 403) {
        setErrorMessage('SEA 授權失效，請重新登入')
      } else {
        setErrorMessage('分析失敗，請稍後重試')
      }
      setStatusText('流程中止')
    } finally {
      setAnalyzing(false)
    }
  }, [
    ready,
    authError,
    client,
    patientId,
    file,
    validateFile,
    azureHeaders,
    csvMetadata,
  ])

  const handleUploadGuarded = useCallback(async () => {
    if (!azureToken) {
      setErrorMessage('請先登入 SEA 服務')
    setErrorMessage('請先登入 SEA 服務')
      return
    }
    await handleUpload()
  }, [azureToken, handleUpload])

  const uploadEnabled = !!azureToken && !!file && !analyzing

  const renderStatusCard = () => (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-200">
          <Activity className="h-4 w-4 text-sky-400" />
          <span className="text-sm font-semibold">分析狀態</span>
        </div>
        <div className="text-xs text-slate-400">{statusText}</div>
      </div>
      {!azureToken && (
        <div className="mt-2 text-xs text-slate-500">
          需先登入 SEA 才可開始分析
        </div>
      )}
      <div className="mt-3 h-2 w-full rounded-full bg-slate-800">
        <div
          className="h-2 rounded-full bg-sky-400 transition-all"
          style={{
            width: `${Math.min(
              100,
              Math.round(
                Math.min(30, (uploadProgress / 100) * 30) +
                  Math.min(40, (Math.min(seaScoreElapsed, 20) / 20) * 40) +
                  Math.min(30, (Math.max(0, seaScoreElapsed - 20) / 30) * 30)
              )
            )}%`,
          }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>整體進度</span>
        <span>
          {Math.min(
            100,
            Math.round(
              Math.min(30, (uploadProgress / 100) * 30) +
                Math.min(40, (Math.min(seaScoreElapsed, 20) / 20) * 40) +
                Math.min(30, (Math.max(0, seaScoreElapsed - 20) / 30) * 30)
            )
          )}
          %
        </span>
      </div>
      {csvError && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4" />
          {csvError}
        </div>
      )}
      {fhirWriteStatus && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {fhirWriteStatus}
          {fhirWriteErrorCode && (
            <span className="ml-2 text-xs text-slate-500">
              (HTTP {fhirWriteErrorCode})
            </span>
          )}
        </div>
      )}
    </div>
  )

  if (!azureToken) {
    return (
      <div className="min-h-screen bg-transparent text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
          <header className="flex items-center justify-between">
            <img
              src={hncLogoEn}
              alt="HNC Logo"
              className="h-12 w-auto"
            />
            <button
              type="button"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 shadow-sm"
            >
              Help Center
            </button>
          </header>

          <div className="flex flex-1 items-center justify-center py-10 -mt-6">
            <div className="flex w-full max-w-lg min-h-[400px] flex-col rounded-2xl border border-slate-700/70 bg-slate-900/90 p-20 shadow-2xl">
              <div className="text-center space-y-5">
                <img
                  src={hncLogo}
                  alt="HNC Logo"
                  className="mx-auto h-16 w-auto"
                />
                <h2 className="text-lg font-semibold text-slate-100">
                  SEA System Login
                </h2>
              </div>

              <div className="mt-6 space-y-5 text-left">
                <div>
                  <label className="text-xs text-slate-400">Account</label>
                  <div className="relative mt-2">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={azureUsername}
                      onChange={(e) => setAzureUsername(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-300/20"
                    />
                  </div>
                </div>
                <div className="pb-4">
                  <label className="text-xs text-slate-400">Password</label>
                  <div className="relative mt-2">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={azurePassword}
                      onChange={(e) => setAzurePassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-9 text-sm text-slate-100 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-300/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {azureLoginError && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    {azureLoginError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAzureLogin}
                  disabled={azureLoginLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {azureLoginLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      登入中...
                    </>
                  ) : (
                    'Sign In'
                  )}
        </button>

                <div className="mt-auto flex items-center justify-between pt-6 text-[11px] text-slate-400">
                  <span>SMART on FHIR Ready</span>
                  <a
                    href={`${import.meta.env.BASE_URL}privacy.html`}
                    target="_blank"
                    rel="noreferrer"
                    className="transition hover:text-slate-200"
                  >
                    隱私權政策 · 法律聲明
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100">
      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">
              EEG Analysis Dashboard
            </h1>
          </div>
          <button
            type="button"
            onClick={handleAzureLogout}
            className="rounded-full bg-slate-800 px-4 py-2 text-xs text-slate-300 transition hover:bg-slate-700"
          >
            登出
          </button>
        </header>


        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-emerald-900/40 px-3 py-1 text-xs text-emerald-200">
            SEA 已連線
          </div>
        </div>

        <section className="grid gap-6 lg:grid-cols-2 items-stretch">
          <aside className="space-y-6 h-full">
            <div className="h-full rounded-2xl border border-slate-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between text-slate-200">
                <div className="flex items-center gap-2">
                  <UploadCloud className="h-5 w-5 text-sky-400" />
                  <span className="text-sm font-semibold">上傳 EEG 檔案</span>
                </div>
                <span className="text-xs text-slate-400">支援 .gz</span>
              </div>

              <div
                className={`relative rounded-xl border border-dashed p-6 text-center transition ${
                  dragActive
                    ? 'border-sky-400 bg-slate-800/60'
                    : 'border-slate-600 bg-slate-900/50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  id="file-input"
                  type="file"
                  accept=".gz"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
                />

                <label
                  htmlFor="file-input"
                  className="flex cursor-pointer flex-col items-center gap-3"
                >
                  <div className="rounded-full bg-slate-800 p-3 shadow-inner shadow-sky-500/30">
                    <FileCheck2 className="h-6 w-6 text-sky-400" />
                  </div>
                  <div className="text-sm font-medium text-slate-100">
                    拖放 EEG 檔案至此
                  </div>
                  <div className="text-xs text-slate-400">
                    檔案將上傳至 SEA 進行 SEA Index 分析
                  </div>
                  <span className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-100">
                    選擇本機檔案
                  </span>
                </label>
              </div>

              <div className="mt-4 space-y-3 min-h-[72px]">
                {file && (
                  <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-sky-500/20 px-2 py-1 text-[10px] font-semibold text-sky-300">
                        .GZ
                      </span>
                      <span className="truncate">{file.name}</span>
                    </div>
                    <span className="text-[10px] text-emerald-300">就緒</span>
                  </div>
                )}
                {errorMessage && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-950/40 p-3 text-sm text-red-200">
                    <AlertTriangle className="h-4 w-4" />
                    {errorMessage}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleUploadGuarded}
                disabled={!uploadEnabled}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-600"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    分析中...
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    確認上傳
                  </>
                )}
              </button>
            </div>
          </aside>

          <div className="space-y-6 h-full">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
              <div className="flex items-center gap-2 text-slate-200">
                <UserRound className="h-4 w-4 text-sky-400" />
                <span className="text-sm font-semibold">病患資訊</span>
              </div>
              <div className="mt-4 divide-y divide-slate-800 text-sm">
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-400">Patient ID</span>
                  <span className="font-medium text-slate-100">
                    {patientInfo?.id || patientId || '-'}
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-slate-200">
                    <UserRound className="h-5 w-5 text-sky-400" />
                    <span className="text-sm font-semibold">檔案資訊</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 divide-y divide-slate-800 text-sm">
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-400">受測者編號</span>
                  <span className="font-medium text-slate-100">
                    {csvMetadata?.SubjectID || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-400">年齡</span>
                  <span className="font-medium text-slate-100">
                    {csvMetadata?.Age || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-400">性別</span>
                  <span className="font-medium text-slate-100">
                    {csvMetadata?.Gender || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-400">是否用藥</span>
                  <span className="font-medium text-slate-100">
                    {csvMetadata?.Drug || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-400">PHQ-9</span>
                  <span className="font-medium text-slate-100">
                    {csvMetadata?.['PHQ-9'] || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-400">檢測日期</span>
                  <span className="font-medium text-slate-100">
                    {csvMetadata?.Time || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-400">訊號品質</span>
                  <span className="font-medium text-slate-100">
                    {signalQualityDisplay}
                  </span>
                </div>
              </div>

              {csvError && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/40 p-3 text-sm text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  {csvError}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="mt-6 pb-6 space-y-4">
          {renderStatusCard()}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200">
                <Radar className="h-4 w-4 text-sky-400" />
                <span className="text-sm font-semibold">SEA Index</span>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={`text-lg font-semibold ${
                    Number.isFinite(seaIndex) && seaIndex >= 9
                      ? 'text-red-500'
                      : Number.isFinite(seaIndex) && seaIndex >= 5
                        ? 'text-yellow-500'
                        : 'text-emerald-600'
                  }`}
                >
                  {seaIndex !== null && Number.isFinite(seaIndex) ? Math.round(seaIndex) : '-'}
                </div>
                <button
                  type="button"
                  onClick={handleDownloadObservation}
                  disabled={!lastObservation}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                >
                  下載 Observation
                </button>
              </div>
            </div>
            <div className="mt-4">
              <div className="relative h-3 w-full rounded-full bg-slate-800">
                <div className="absolute inset-0 flex">
                  <div className="w-2/5 rounded-l-full bg-emerald-500" />
                  <div className="w-2/5 bg-yellow-400" />
                  <div className="w-1/5 rounded-r-full bg-red-500" />
                </div>
                <div
                  className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-slate-100"
                  style={{
                    left: `${
                      Number.isFinite(seaIndex)
                        ? Math.min(100, Math.max(0, ((seaIndex - 1) / 9) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <div className="w-2/5 text-center text-emerald-600">低壓力 (1-4)</div>
                <div className="w-2/5 text-center text-yellow-500">臨界值 (5-8)</div>
                <div className="w-1/5 text-center text-red-500">高壓力 (9-10)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
