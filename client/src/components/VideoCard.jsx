import React from 'react';
import { Video, Music } from 'lucide-react';

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

const VideoCard = ({
    video,
    isSelected,
    onToggleSelect,
    format,
    setFormat,
    quality,
    setQuality
}) => {
    return (
        <div className={`border rounded-lg overflow-hidden transition-all ${isSelected ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
            <div className="p-4 flex gap-4">
                <div className="relative flex-shrink-0">
                    <img
                        src={video.thumbnail}
                        alt="Video thumbnail"
                        className="w-32 h-20 object-cover rounded-lg"
                    />
                    <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white text-xs px-1 rounded">
                        {video.duration}
                    </div>
                    <div className="absolute top-2 left-2">
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={onToggleSelect}
                            className="h-4 w-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                        />
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-800 mb-1 truncate">{video.title}</h3>
                    <p className="text-xs text-gray-600 mb-2">{video.views}</p>

                    {isSelected && (
                        <div className="space-y-2 mt-2">
                            <div className="flex gap-2">
                                {formatOptions.map((option) => {
                                    const IconComponent = option.icon;
                                    return (
                                        <button
                                            key={option.value}
                                            onClick={() => setFormat(option.value)}
                                            className={`p-2 text-xs rounded border transition-colors flex items-center gap-1 ${format === option.value
                                                    ? 'border-red-500 bg-red-50 text-red-700'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                        >
                                            <IconComponent className="w-3 h-3" />
                                            <span>{option.label.split(' ')[0]}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {qualityOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => setQuality(option.value)}
                                        className={`p-1 px-2 text-xs rounded border transition-colors ${quality === option.value
                                                ? 'border-red-500 bg-red-50 text-red-700'
                                                : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VideoCard;