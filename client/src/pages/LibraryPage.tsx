import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, FileVideo, Calendar, HardDrive, ShieldCheck, Film, Trash2 } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { formatBytes, formatDate } from '../utils/format';
import type { Video } from '../types';

export default function LibraryPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, video: Video) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${video.title}" permanently? This removes its encrypted stream and key.`)) return;
    setDeletingId(video.id);
    try {
      await apiClient.delete(`/videos/${video.id}`);
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
    } catch {
      setError('Failed to delete the video. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get<Video[]>('/videos');
        setVideos(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching videos:', err);
        setError('Failed to load video library. Please check server connection.');
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10 pb-6 border-b-2 border-white/10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-[#7c3aed] border-2 border-white" style={{ boxShadow: '3px 3px 0px #fff' }}>
              <Film className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white uppercase">
              Secure Library
            </h1>
          </div>
          <p className="text-gray-500 text-sm font-mono">
            Protected media streams — click any card to launch encrypted player
          </p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="brutal-card p-4 space-y-4 animate-pulse">
              <div className="aspect-video bg-white/5" />
              <div className="h-4 bg-white/10 w-2/3" />
              <div className="h-3 bg-white/5 w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="brutal-card-danger p-8 max-w-xl mx-auto text-center">
          <p className="text-[#ef4444] font-black text-lg uppercase tracking-wide mb-2">Connection Error</p>
          <p className="text-gray-400 text-sm font-mono mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="brutal-btn-danger text-sm font-bold uppercase tracking-wide px-4 py-2"
          >
            Retry Connection
          </button>
        </div>
      ) : videos.length === 0 ? (
        <div className="brutal-card p-12 max-w-lg mx-auto text-center">
          <div className="p-4 border-2 border-white/20 inline-flex text-gray-600 mb-6" style={{ boxShadow: '3px 3px 0px rgba(124,58,237,0.3)' }}>
            <FileVideo className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-black text-white uppercase tracking-wide mb-2">No Videos Found</h2>
          <p className="text-gray-500 text-sm font-mono mb-8 max-w-xs mx-auto">
            Upload your first MP4 video to begin streaming securely.
          </p>
          <a href="#upload-section" className="brutal-btn">
            Upload Now
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => (
            <Link
              key={video.id}
              to={`/player/${video.id}`}
              className="brutal-card flex flex-col justify-between group transition-all duration-75 hover:-translate-y-0.5 hover:-translate-x-0.5"
              style={{ '--hover-shadow': '6px 6px 0px #7c3aed' } as React.CSSProperties}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '6px 6px 0px #7c3aed')}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '4px 4px 0px #7c3aed')}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-[#0a0a0a] border-b-2 border-white/10 flex items-center justify-center overflow-hidden">
                <FileVideo className="w-12 h-12 text-gray-800 group-hover:text-[#7c3aed] transition-colors duration-150" />

                {/* Protected stamp */}
                <div className="absolute top-3 right-3">
                  <span className="brutal-badge brutal-badge-violet">
                    <ShieldCheck className="w-2.5 h-2.5" />
                    Protected
                  </span>
                </div>

                {/* Delete */}
                <button
                  onClick={(e) => handleDelete(e, video)}
                  disabled={deletingId === video.id}
                  title="Delete video"
                  aria-label="Delete video"
                  className="absolute top-3 left-3 z-10 p-1.5 bg-black/70 border-2 border-white/20 text-gray-400 hover:text-white hover:border-[#ef4444] hover:bg-[#ef4444]/20 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Play hover */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="p-3 bg-[#7c3aed] border-2 border-white" style={{ boxShadow: '3px 3px 0px #fff' }}>
                    <Play fill="currentColor" className="w-5 h-5 text-white translate-x-0.5" />
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="p-4 flex flex-col gap-3 flex-grow">
                <div>
                  <h3 className="font-bold text-white text-sm uppercase tracking-wide truncate group-hover:text-[#a78bfa] transition-colors" title={video.title}>
                    {video.title}
                  </h3>
                  <p className="text-gray-600 text-xs font-mono truncate mt-0.5" title={video.originalName}>
                    {video.originalName}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-gray-500 text-xs font-mono border-t-2 border-white/5 pt-3 mt-auto">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(video.uploadDate)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>{formatBytes(video.size)}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
