import React, { useEffect, useState } from 'react';
import {
    Download,
    Video,
    Music,
    AlertCircle,
    CheckCircle,
    Loader,
    Play,
    ListVideo
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import VideoCard from './VideoCard';

const API_BASE = 'http://localhost:5000/api';

// Enhanced URL validation with regex
const validateYouTubeUrl = (url) => {
    const video_regex = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{11}.*$/;
    const playlist_regex = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com\/playlist\?list=)[A-Za-z0-9_-]+.*$/;

    return video_regex.test(url) || playlist_regex.test(url);
};

const isPlaylistUrl = (url) => {
    const playlist_regex = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com\/playlist\?list=)[A-Za-z0-9_-]+.*$/;
    return playlist_regex.test(url);
};

const formatOptions = [
    { value: 'mp4', label: 'MP4 (Video)', icon: Video },
    { value: 'mp3', label: 'MP3 (Audio)', icon: Music },
    { value: 'webm', label: 'WebM (Video)', icon: Video }
];

const qualityOptions = [
    { value: '144p', label: '144p' },
    { value: '360p', label: '360p' },
    { value: '720p', label: '720p' },
    { value: '1080p', label: '1080p' },
    { value: '1440p 2k', label: '1440p 2K' },
    { value: '2160p 4k', label: '2160p 4K' },
];

const DownloadForm = () => {
    const [url, setUrl] = useState('');
    const [format, setFormat] = useState('mp4');
    const [quality, setQuality] = useState('1080p');
    const [isLoading, setIsLoading] = useState(false);
    const [isDetecting, setIsDetecting] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [videoInfo, setVideoInfo] = useState(null);
    const [playlistInfo, setPlaylistInfo] = useState(null);
    const [selectedVideos, setSelectedVideos] = useState([]);
    const [showDownloadOptions, setShowDownloadOptions] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [abortController, setAbortController] = useState(null);

    useEffect(() => {
        const detectContent = async () => {
            if (!url || !validateYouTubeUrl(url)) {
                setVideoInfo(null);
                setPlaylistInfo(null);
                setShowDownloadOptions(false);
                setError('');
                return;
            }

            setIsDetecting(true);
            setError('');
            setStatus('Detecting content...');

            try {
                if (isPlaylistUrl(url)) {
                    const controller = new AbortController();
                    const res = await fetch(`${API_BASE}/playlist/info`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url }),
                        signal: controller.signal
                    });

                    const data = await res.json();

                    if (data.error) {
                        toast.error(data.error);
                        setPlaylistInfo(null);
                        setShowDownloadOptions(false);
                        return;
                    }

                    setPlaylistInfo({
                        id: data.id,
                        title: data.title,
                        thumbnail: data.thumbnail,
                        videoCount: data.videoCount,
                        videos: data.videos.map(video => ({
                            id: video.id,
                            url: `https://www.youtube.com/watch?v=${video.id}`,
                            thumbnail: `${API_BASE}/thumbnail/${video.id}`,
                            title: video.title,
                            duration: formatDuration(video.duration),
                            views: formatViews(video.views)
                        }))
                    });

                    setSelectedVideos(Array(data.videos.length).fill(false));
                    setShowDownloadOptions(true);
                    toast.success('Playlist detected successfully!');
                } else {
                    const controller = new AbortController();
                    const res = await fetch(`${API_BASE}/info`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url }),
                        signal: controller.signal
                    });

                    const data = await res.json();

                    if (data.error) {
                        toast.error(data.error);
                        setVideoInfo(null);
                        setShowDownloadOptions(false);
                        return;
                    }

                    setVideoInfo({
                        id: data.id,
                        thumbnail: `${API_BASE}/thumbnail/${data.id}`,
                        title: data.title,
                        duration: formatDuration(data.duration),
                        views: formatViews(data.views)
                    });

                    setShowDownloadOptions(true);
                    toast.success('Video detected successfully!');
                }
                setStatus('');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    toast.error(`Failed to detect content: ${error.message}`);
                    setVideoInfo(null);
                    setPlaylistInfo(null);
                    setShowDownloadOptions(false);
                }
            } finally {
                setIsDetecting(false);
            }
        };

        const timeoutId = setTimeout(detectContent, 800);
        return () => {
            clearTimeout(timeoutId);
            if (abortController) {
                abortController.abort();
            }
        };
    }, [url]);

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = String(Math.floor(seconds % 60)).padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const formatViews = (views) => {
        if (views >= 1000000) {
            return `${(views / 1000000).toFixed(1)}M views`;
        } else if (views >= 1000) {
            return `${(views / 1000).toFixed(1)}K views`;
        }
        return `${views} views`;
    };

    const handleUrlChange = (e) => {
        const newUrl = e.target.value;
        setUrl(newUrl);
        setStatus('');
    };

    const toggleVideoSelection = (index) => {
        const newSelection = [...selectedVideos];
        newSelection[index] = !newSelection[index];
        setSelectedVideos(newSelection);
    };

    const handleDownload = async () => {
        if (!url || !validateYouTubeUrl(url)) {
            toast.error('Please enter a valid YouTube URL');
            return;
        }

        const controller = new AbortController();
        setAbortController(controller);
        
        setIsLoading(true);
        setDownloadProgress(0);
        setStatus('Preparing download...');
        setError('');

        try {
            if (playlistInfo) {
                const videosToDownload = playlistInfo.videos.filter((_, index) => selectedVideos[index]);
                if (videosToDownload.length === 0) {
                    toast.error('Please select at least one video to download');
                    setIsLoading(false);
                    return;
                }

                for (const [index, video] of videosToDownload.entries()) {
                    setStatus(`Downloading ${index + 1}/${videosToDownload.length}: ${video.title}`);
                    setDownloadProgress(Math.round((index / videosToDownload.length) * 100));

                    const response = await fetch(`${API_BASE}/download`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            url: video.url,
                            format,
                            quality
                        }),
                        signal: controller.signal
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to download ${video.title}`);
                    }

                    const reader = response.body.getReader();
                    const contentLength = +response.headers.get('Content-Length');
                    let receivedLength = 0;
                    let chunks = [];

                    while (true) {
                        const { done, value } = await reader.read();

                        if (done) break;

                        chunks.push(value);
                        receivedLength += value.length;

                        const fileProgress = Math.round((receivedLength / contentLength) * 100);
                        const overallProgress = Math.round(
                            (index / videosToDownload.length) * 100 +
                            (fileProgress / videosToDownload.length)
                        );

                        setDownloadProgress(overallProgress);
                    }

                    const blob = new Blob(chunks);
                    const downloadUrl = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.download = `${video.title}.${format}`.replace(/[<>:"/\\|?*]+/g, '_');
                    document.body.appendChild(link);
                    link.click();
                    
                    setTimeout(() => {
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(downloadUrl);
                    }, 100);
                }

                toast.success(`Downloaded ${videosToDownload.length} videos successfully!`);
            } else {
                setStatus('Downloading...');
                const response = await fetch(`${API_BASE}/download`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, format, quality }),
                    signal: controller.signal
                });

                if (!response.ok) throw new Error('Download failed');

                const reader = response.body.getReader();
                const contentLength = +response.headers.get('Content-Length');
                let receivedLength = 0;
                let chunks = [];

                while (true) {
                    const { done, value } = await reader.read();

                    if (done) break;

                    chunks.push(value);
                    receivedLength += value.length;
                    setDownloadProgress(Math.round((receivedLength / contentLength) * 100));
                }

                const blob = new Blob(chunks);
                const downloadUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = `${videoInfo.title}.${format}`.replace(/[<>:"/\\|?*]+/g, '_');
                document.body.appendChild(link);
                link.click();
                
                setTimeout(() => {
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(downloadUrl);
                }, 100);

                toast.success('Download completed successfully!');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Download error:', error);
                toast.error(`Download failed: ${error.message}`);
            }
        } finally {
            setIsLoading(false);
            setDownloadProgress(0);
            setStatus('');
            setAbortController(null);
        }
    };

    const handleCancelDownload = () => {
        if (abortController) {
            abortController.abort();
            setIsLoading(false);
            setDownloadProgress(0);
            setStatus('Download cancelled');
            toast('Download cancelled', { icon: '⚠️' });
        }
    };

    const selectAllVideos = () => {
        setSelectedVideos(Array(playlistInfo.videos.length).fill(true));
    };

    const deselectAllVideos = () => {
        setSelectedVideos(Array(playlistInfo.videos.length).fill(false));
    };

    return (
        <>
            <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
                <Toaster position="top-center" reverseOrder={false} />

                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        YouTube URL
                    </label>
                    <div className="relative">
                        <input
                            type="url"
                            value={url}
                            onChange={handleUrlChange}
                            placeholder="Paste your video or playlist link here.."
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 pr-12"
                        />
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            {isDetecting ? (
                                <Loader className="w-5 h-5 text-blue-500 animate-spin" />
                            ) : url && validateYouTubeUrl(url) && (videoInfo || playlistInfo) ? (
                                <CheckCircle className="w-5 h-5 text-green-500" />
                            ) : url && validateYouTubeUrl(url) ? (
                                <Loader className="w-5 h-5 text-blue-500 animate-spin" />
                            ) : url && (
                                <AlertCircle className="w-5 h-5 text-red-500" />
                            )}
                        </div>
                    </div>
                </div>

                {/* Single Video Preview */}
                {videoInfo && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg border-2 border-green-200">
                        <div className="flex gap-4">
                            <div className="relative">
                                <img
                                    src={videoInfo.thumbnail}
                                    alt="Video thumbnail"
                                    className="w-40 h-28 object-cover rounded-lg"
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="bg-black bg-opacity-50 rounded-full p-2">
                                        <Play className="w-6 h-6 text-white" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold text-gray-800 mb-2 text-lg">{videoInfo.title}</h3>
                                <p className="text-sm text-gray-600 mb-1">Duration: {videoInfo.duration}</p>
                                <p className="text-sm text-gray-600">{videoInfo.views}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Playlist Preview */}
                {playlistInfo && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg border-2 border-blue-200">
                        <div className="flex gap-4 mb-4">
                            <div className="relative">
                                <img
                                    src={playlistInfo.thumbnail}
                                    alt="Playlist thumbnail"
                                    className="w-40 h-28 object-cover rounded-lg"
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="bg-black bg-opacity-50 rounded-full p-2">
                                        <ListVideo className="w-6 h-6 text-white" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold text-gray-800 mb-2 text-lg">{playlistInfo.title}</h3>
                                <p className="text-sm text-gray-600 mb-1">{playlistInfo.videoCount} videos</p>
                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={selectAllVideos}
                                        className="text-xs bg-blue-100 text-blue-800 px-3 py-1 rounded hover:bg-blue-200"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={deselectAllVideos}
                                        className="text-xs bg-gray-100 text-gray-800 px-3 py-1 rounded hover:bg-gray-200"
                                    >
                                        Deselect All
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                            {playlistInfo.videos.map((video, index) => (
                                <VideoCard
                                    key={video.id}
                                    video={video}
                                    isSelected={selectedVideos[index]}
                                    onToggleSelect={() => toggleVideoSelection(index)}
                                    format={format}
                                    setFormat={setFormat}
                                    quality={quality}
                                    setQuality={setQuality}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Download Options */}
                {showDownloadOptions && (videoInfo || playlistInfo) && (
                    <div className="space-y-6 border-t pt-6">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Download Options</h3>

                        {/* Format Selector */}
                        {!playlistInfo && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3">Format</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {formatOptions.map((option) => {
                                        const IconComponent = option.icon;
                                        return (
                                            <button
                                                key={option.value}
                                                onClick={() => setFormat(option.value)}
                                                className={`p-3 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${format === option.value
                                                    ? 'border-red-500 bg-red-50 text-red-700'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                <IconComponent className="w-4 h-4" />
                                                <span className="text-sm font-medium">{option.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Quality Selector */}
                        {!playlistInfo && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3">Quality</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {qualityOptions.map((option) => (
                                        <button
                                            key={option.value}
                                            onClick={() => setQuality(option.value)}
                                            className={`p-3 rounded-lg border-2 transition-colors ${quality === option.value
                                                ? 'border-red-500 bg-red-50 text-red-700'
                                                : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                        >
                                            <span className="text-sm font-medium">{option.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Download Button with Progress */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleDownload}
                                disabled={isLoading}
                                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-3 text-lg relative overflow-hidden"
                            >
                                {isLoading ? (
                                    <>
                                        <div
                                            className="absolute left-0 top-0 h-full bg-red-700 transition-all duration-300"
                                            style={{ width: `${downloadProgress}%` }}
                                        />
                                        <span className="relative z-10 flex items-center gap-2">
                                            <Loader className="w-5 h-5 animate-spin" />
                                            {status || 'Processing...'} ({downloadProgress}%)
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-5 h-5" />
                                        {playlistInfo ? (
                                            `Download ${selectedVideos.filter(Boolean).length} Selected Videos`
                                        ) : (
                                            `Download ${format.toUpperCase()} - ${quality}`
                                        )}
                                    </>
                                )}
                            </button>
                            
                            {isLoading && (
                                <button
                                    onClick={handleCancelDownload}
                                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-4 px-6 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* No Content Message */}
                {!videoInfo && !playlistInfo && !isDetecting && (
                    <div className="text-center py-8 text-gray-500">
                        <Video className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <p className="text-lg mb-2">Paste a YouTube URL to get started</p>
                        <p className="text-sm">The video or playlist will be automatically detected</p>
                    </div>
                )}
            </div>
        </>
    );
};

export default DownloadForm;