import { useState, useRef } from 'react';
import axios from 'axios';
import type { AxiosProgressEvent } from 'axios';
import { Upload, FileVideo, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../config/api';
import { formatBytes } from '../utils/format';
import type { UploadResponse } from '../types';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<UploadResponse | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (selectedFile: File): boolean => {
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    const isMp4 = ext === 'mp4' && (selectedFile.type === 'video/mp4' || selectedFile.type === '');
    if (!isMp4) {
      setError('Only MP4 video files (.mp4) are allowed.');
      setFile(null);
      return false;
    }
    setError(null);
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    if (validateFile(selectedFile)) {
      setFile(selectedFile);
      if (!title) setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    if (!droppedFile) return;
    if (validateFile(droppedFile)) {
      setFile(droppedFile);
      if (!title) setTitle(droppedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) { setError('Please select a video file first.'); return; }

    setUploading(true);
    setError(null);
    setSuccess(null);
    setProgress(0);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', title.trim());

    try {
      const response = await axios.post<UploadResponse>(`${API_BASE}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent: AxiosProgressEvent) => {
          const total = progressEvent.total ?? progressEvent.loaded;
          setProgress(Math.round((progressEvent.loaded * 100) / total));
        },
      });
      setSuccess(response.data);
      setFile(null);
      setTitle('');
      setProgress(0);
    } catch (err) {
      console.error('Upload failed:', err);
      const apiMessage = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string } | undefined)?.error
        : undefined;
      setError(apiMessage ?? 'An error occurred during the upload. Please check connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-[#7c3aed] border-2 border-white" style={{ boxShadow: '3px 3px 0px #fff' }}>
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white uppercase">Upload Content</h1>
        </div>
        <p className="text-gray-500 text-sm font-mono ml-14">
          MP4 files only — max 100MB — streamed through secure proxy
        </p>
      </div>

      <div className="brutal-card p-6 md:p-8">
        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 border-2 border-[#ef4444] bg-[#1a0a0a] p-4 text-sm" style={{ boxShadow: '3px 3px 0px #ef4444' }}>
            <AlertCircle className="w-5 h-5 shrink-0 text-[#ef4444]" />
            <p className="font-mono text-[#ef4444]">{error}</p>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mb-6 border-2 border-[#22c55e] bg-[#0a1a0a] p-4" style={{ boxShadow: '3px 3px 0px #22c55e' }}>
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#22c55e]" />
              <p className="font-black text-[#22c55e] uppercase tracking-wide text-sm">{success.message}</p>
            </div>
            <div className="border-2 border-[#22c55e]/30 bg-[#0a1a0a] p-3 flex justify-between items-center gap-3">
              <div className="min-w-0">
                <p className="font-bold text-white text-sm truncate">{success.video.title}</p>
                <p className="text-gray-500 font-mono text-xs mt-0.5 truncate">{success.video.filename}</p>
              </div>
              <Link
                to={`/player/${success.video.filename}`}
                className="brutal-btn text-sm shrink-0"
                style={{ padding: '0.4rem 0.75rem' }}
              >
                Play Now
              </Link>
            </div>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="video-title" className="block text-xs font-black text-gray-300 uppercase tracking-widest mb-2 font-mono">
              Video Title
            </label>
            <input
              type="text"
              id="video-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter custom title (optional)"
              className="brutal-input"
              disabled={uploading}
            />
          </div>

          {/* Drop zone */}
          <div>
            <label className="block text-xs font-black text-gray-300 uppercase tracking-widest mb-2 font-mono">
              Video File
            </label>
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed p-8 text-center transition-all duration-75 ${
                isDragActive
                  ? 'border-[#7c3aed] bg-[#7c3aed]/10'
                  : 'border-white/20 bg-[#0a0a0a] hover:border-white/40'
              } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
              style={isDragActive ? { boxShadow: '4px 4px 0px #7c3aed' } : {}}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".mp4,video/mp4"
                className="hidden"
                disabled={uploading}
              />

              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3 border-2 border-[#7c3aed] bg-[#7c3aed]/10" style={{ boxShadow: '3px 3px 0px #7c3aed' }}>
                    <FileVideo className="w-8 h-8 text-[#a78bfa]" />
                  </div>
                  <div>
                    <p className="text-white font-bold truncate max-w-xs text-sm">{file.name}</p>
                    <p className="text-gray-500 text-xs mt-1 font-mono">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFile(null); setTitle(''); }}
                    className="text-xs text-[#ef4444] font-bold uppercase tracking-wide border border-[#ef4444]/30 px-3 py-1 hover:bg-[#ef4444]/10 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 border-2 border-white/10 bg-[#111]">
                    <Upload className="w-10 h-10 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">
                      Drop MP4 here or <span className="text-[#a78bfa] underline underline-offset-2">browse</span>
                    </p>
                    <p className="text-gray-600 text-xs mt-1 font-mono">Max 100MB</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono font-bold text-gray-400 uppercase tracking-wide">
                <span>Uploading...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-[#111] border-2 border-white/10 h-3">
                <div
                  style={{ width: `${progress}%` }}
                  className="bg-[#7c3aed] h-full transition-all duration-200"
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={uploading || !file}
            className="brutal-btn w-full py-3.5 text-sm uppercase tracking-widest"
          >
            {uploading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing Upload
              </>
            ) : (
              'Start Secure Upload'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
