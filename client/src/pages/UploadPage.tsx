import { useState, useRef } from 'react';
import axios from 'axios';
import type { AxiosProgressEvent } from 'axios';
import { Upload, FileVideo, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
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
    if (!file) {
      setError('Please select a video file first.');
      return;
    }

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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center p-2 bg-violet-600/10 rounded-full text-violet-400 mb-3 border border-violet-500/20">
          <Sparkles className="w-5 h-5 animate-pulse" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
          Upload Secure Content
        </h1>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          Upload MP4 video files to preview streaming protocols and custom browser lockouts.
        </p>
      </div>

      <div className="glass-panel rounded-2xl border border-white/10 p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-950/40 border border-red-500/30 text-red-300 p-4 rounded-xl text-sm animate-fadeIn">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 p-4 rounded-xl text-sm animate-fadeIn">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <p className="font-semibold">{success.message}</p>
            </div>
            <div className="bg-emerald-950/50 rounded-lg p-3 border border-emerald-500/10 text-xs flex justify-between items-center">
              <div>
                <p className="font-medium text-white truncate max-w-xs">{success.video.title}</p>
                <p className="text-gray-400 font-mono mt-0.5">{success.video.filename}</p>
              </div>
              <Link
                to={`/player/${success.video.filename}`}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-1.5 px-3 rounded-md transition-colors whitespace-nowrap shadow-sm shadow-emerald-700/30"
              >
                Play Now
              </Link>
            </div>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-6">
          <div>
            <label htmlFor="video-title" className="block text-sm font-semibold text-gray-300 mb-2">
              Video Title
            </label>
            <input
              type="text"
              id="video-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter custom title (optional)"
              className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition duration-200"
              disabled={uploading}
            />
          </div>

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 ${
              isDragActive
                ? 'border-violet-500 bg-violet-600/10 shadow-lg shadow-violet-600/5'
                : 'border-white/10 bg-black/20 hover:border-violet-500/50 hover:bg-violet-600/5'
            } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
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
              <div className="space-y-3 flex flex-col items-center justify-center animate-fadeIn">
                <div className="p-4 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/20">
                  <FileVideo className="w-10 h-10" />
                </div>
                <div>
                  <p className="text-white font-medium truncate max-w-md">{file.name}</p>
                  <p className="text-gray-400 text-xs mt-1 font-mono">{formatBytes(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setTitle('');
                  }}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold underline underline-offset-2 hover:no-underline transition-colors"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="space-y-4 flex flex-col items-center justify-center">
                <div className="p-4 rounded-xl bg-gray-900 border border-white/5 text-gray-400 group-hover:text-violet-400 group-hover:border-violet-500/20 transition-all duration-300">
                  <Upload className="w-10 h-10 group-hover:scale-110 transition-transform" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm md:text-base">
                    Drag and drop your MP4 file here, or{' '}
                    <span className="text-violet-400 group-hover:underline">browse</span>
                  </p>
                  <p className="text-gray-500 text-xs mt-1.5">Supports MP4 videos up to 100MB</p>
                </div>
              </div>
            )}
          </div>

          {uploading && (
            <div className="space-y-2 animate-pulse">
              <div className="flex justify-between text-xs font-semibold text-gray-400">
                <span>Uploading files...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-black/40 rounded-full h-2.5 overflow-hidden border border-white/5">
                <div
                  style={{ width: `${progress}%` }}
                  className="bg-gradient-to-r from-violet-600 to-indigo-500 h-full rounded-full transition-all duration-300 ease-out"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={uploading || !file}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 ${
              uploading || !file
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed shadow-none border border-white/5'
                : 'bg-violet-600 hover:bg-violet-500 cursor-pointer shadow-violet-600/25 active:scale-[0.98]'
            }`}
          >
            {uploading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing Upload...
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
