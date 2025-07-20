import { Download } from 'lucide-react'
import React from 'react'

const Header = () => {
    return (
        <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
                <div className="p-3 bg-red-600 rounded-full">
                    <Download className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-4xl font-bold text-white">NextTube - YouTube Downloader</h1>
            </div>
            <p className="text-slate-300 max-w-2xl mx-auto">
                Paste the YouTube URL and download in your preferrored format.
            </p>
        </div >
    )
}

export default Header
