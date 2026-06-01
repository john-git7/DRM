import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Play, FileVideo, Calendar, HardDrive, ShieldCheck, Film } from 'lucide-react';

export default function LibraryPage() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_BASE = 'http://localhost:5000/api';

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_BASE}/videos`);
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

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex-grow">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10 pb-6 border-b border-white/5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Film className="w-8 h-8 text-violet-500" />
            Secure Video Library
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Access secure media streams. Click any card to launch the custom encrypted player.
          </p>
        </div>
        <Link
          to="/upload"
          className="bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-md shadow-violet-600/10 self-start md:self-auto active:scale-[0.98]"
        >
          Upload New Video
        </Link>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel border border-white/10 rounded-2xl p-4 space-y-4 animate-pulse">
              <div className="aspect-video bg-white/5 rounded-xl" />
              <div className="h-4 bg-white/10 rounded w-2/3" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16 bg-red-950/20 border border-red-500/20 rounded-2xl max-w-xl mx-auto p-8">
          <p className="text-red-400 font-semibold text-lg mb-2">Connection Error</p>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-900 hover:bg-red-800 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            Retry Connection
          </button>
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-20 glass-panel border border-white/10 rounded-2xl max-w-lg mx-auto p-8">
          <div className="p-4 bg-white/5 rounded-full inline-flex text-gray-500 mb-4 border border-white/5">
            <FileVideo className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">No videos found</h2>
          <p className="text-gray-400 text-sm mb-8 max-w-xs mx-auto">
            Get started by uploading your first MP4 video. Once uploaded, it will appear here.
          </p>
          <Link
            to="/upload"
            className="bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-md shadow-violet-600/10 inline-flex items-center gap-2"
          >
            Upload Now
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
          {videos.map((video) => (
            <Link
              key={video.id}
              to={`/player/${video.filename}`}
              className="glass-panel border border-white/8 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:border-violet-500/30 transition-all duration-300 hover:scale-[1.01] hover:bg-white/[0.04] group flex flex-col justify-between"
            >
              {/* Media Thumbnail Placeholder */}
              <div className="relative aspect-video bg-black/60 border-b border-white/5 flex items-center justify-center overflow-hidden">
                {/* Visual waves / gradients */}
                <div className="absolute inset-0 bg-radial-gradient from-violet-900/10 via-transparent to-transparent opacity-60" />
                <FileVideo className="w-12 h-12 text-gray-700 group-hover:text-violet-500 group-hover:scale-110 transition-all duration-300" />
                
                {/* Badge for demonstration */}
                <div className="absolute top-3 right-3 bg-violet-600/20 text-violet-400 border border-violet-500/20 text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded flex items-center gap-1 font-mono">
                  <ShieldCheck className="w-3 h-3" />
                  Protected
                </div>

                {/* Overlaid Play button that shows on hover */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="p-3 bg-violet-600 rounded-full text-white shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                    <Play fill="currentColor" className="w-5 h-5 translate-x-0.5" />
                  </div>
                </div>
              </div>

              {/* Video Info */}
              <div className="p-4 space-y-3 flex-grow flex flex-col justify-between">
                <div>
                  <h3 className="font-semibold text-white text-base truncate group-hover:text-violet-400 transition-colors" title={video.title}>
                    {video.title}
                  </h3>
                  <p className="text-gray-500 text-xs font-mono truncate mt-0.5" title={video.originalName}>
                    {video.originalName}
                  </p>
                </div>

                {/* Metadata badges */}
                <div className="flex items-center gap-4 text-gray-400 text-xs border-t border-white/5 pt-3 mt-auto">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                    <span>{formatDate(video.uploadDate)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5 text-gray-500" />
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
