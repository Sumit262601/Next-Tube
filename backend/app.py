from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from yt_dlp import YoutubeDL
from PIL import Image
import os
import requests
import re
from io import BytesIO
import certifi
import ssl
import zipfile
from werkzeug.utils import secure_filename

# SSL Configuration
ssl._create_default_https_context = ssl.create_default_context(cafile=certifi.where())

app = Flask(__name__)
CORS(app)

# Directory setup
DOWNLOAD_DIR = 'downloads'
THUMBNAIL_DIR = 'thumbnails'
os.makedirs(DOWNLOAD_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)

def validate_url(url):
    """Validate YouTube URL format for both videos and playlists."""
    video_regex = r'^(https?://)?(www\.)?(m\.)?(youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_-]{11}.*$'
    playlist_regex = r'^(https?://)?(www\.)?(m\.)?(youtube\.com/playlist\?list=)[A-Za-z0-9_-]+.*$'
    return bool(re.match(video_regex, url) or re.match(playlist_regex, url))

def is_playlist(url):
    """Check if URL is a playlist."""
    return "playlist?list=" in url or "/playlist/" in url

@app.route('/api/info', methods=['POST'])
def get_info():
    """Get video/playlist information and thumbnails"""
    url = request.json.get('url')
    if not url:
        return jsonify({'error': 'URL is required'}), 400

    if not validate_url(url):
        return jsonify({'error': 'Invalid YouTube URL'}), 400

    try:
        ydl_opts = {
            'quiet': True,
            'extract_flat': True,
            'noplaylist': not is_playlist(url),
        }
        
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        # Handle playlist
        if info.get('_type') == 'playlist':
            videos = []
            for entry in info['entries']:
                try:
                    thumb_response = requests.get(entry.get('thumbnail'), timeout=5)
                    img = Image.open(BytesIO(thumb_response.content))
                    thumb_path = os.path.join(THUMBNAIL_DIR, f"{entry['id']}.jpg")
                    img.save(thumb_path)
                    
                    videos.append({
                        'id': entry['id'],
                        'title': entry['title'],
                        'duration': entry.get('duration'),
                        'thumbnail': f"/api/thumbnail/{entry['id']}"
                    })
                except Exception as e:
                    print(f"Error processing playlist item: {str(e)}")
                    continue

            return jsonify({
                'type': 'playlist',
                'id': info['id'],
                'title': info['title'],
                'video_count': len(info['entries']),
                'videos': videos
            })
        
        # Handle single video
        thumb_url = info.get('thumbnail')
        response = requests.get(thumb_url, timeout=10)
        img = Image.open(BytesIO(response.content))
        thumb_path = os.path.join(THUMBNAIL_DIR, f"{info['id']}.jpg")
        img.save(thumb_path)

        return jsonify({
            'type': 'video',
            'id': info['id'],
            'title': info['title'],
            'duration': info['duration'],
            'views': info.get('view_count'),
            'thumbnail': f"/api/thumbnail/{info['id']}",
            'formats': [f for f in info.get('formats', []) if f.get('height')]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/thumbnail/<video_id>', methods=['GET'])
def get_thumbnail(video_id):
    """Serve saved thumbnail"""
    path = os.path.join(THUMBNAIL_DIR, f"{video_id}.jpg")
    if os.path.exists(path):
        return send_file(path, mimetype='image/jpeg')
    return jsonify({'error': 'Thumbnail not found'}), 404

@app.route('/api/download', methods=['POST'])
def download():
    """Download video/audio or playlist"""
    data = request.json
    url = data.get('url')
    format = data.get('format', 'mp4')
    quality_label = data.get('quality', '1080p')
    
    if not url or not validate_url(url):
        return jsonify({'error': 'Invalid YouTube URL'}), 400

    quality = ''.join(filter(str.isdigit, quality_label)) or '1080'
    is_playlist_flag = is_playlist(url)

    try:
        video_format = (
            f"bestvideo[height<={quality}]+bestaudio/best[height<={quality}]"
            if format in ['mp4', 'webm']
            else "bestaudio"
        )

        ydl_opts = {
            'format': video_format,
            'merge_output_format': format if format in ['mp4', 'webm'] else None,
            'quiet': True,
            'continuedl': True,
            'retries': 5,
            'nocheckcertificate': True,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': format,
                'preferredquality': '192',
            }] if format in ['mp3', 'wav'] else []
        }

        if is_playlist_flag:
            # For playlists, create a zip file
            playlist_dir = os.path.join(DOWNLOAD_DIR, 'playlists')
            os.makedirs(playlist_dir, exist_ok=True)
            ydl_opts['outtmpl'] = os.path.join(playlist_dir, '%(playlist_title)s', '%(title)s.%(ext)s')
            
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                playlist_title = info.get('title', 'playlist')
                safe_title = secure_filename(playlist_title)
                zip_filename = os.path.join(DOWNLOAD_DIR, f"{safe_title}.zip")
                
                # Create zip file
                with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    for root, _, files in os.walk(os.path.join(playlist_dir, playlist_title)):
                        for file in files:
                            file_path = os.path.join(root, file)
                            arcname = os.path.relpath(file_path, os.path.join(playlist_dir, playlist_title))
                            zipf.write(file_path, arcname=os.path.join(safe_title, arcname))
                
                return send_file(zip_filename, as_attachment=True, download_name=f"{safe_title}.zip")
        else:
            # Single video download
            ydl_opts['outtmpl'] = os.path.join(DOWNLOAD_DIR, '%(title)s.%(ext)s')
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
                
                if format in ['mp3', 'wav']:
                    filename = os.path.splitext(filename)[0] + f'.{format}'

            if not os.path.exists(filename):
                return jsonify({'error': 'Download failed or file missing'}), 500

            return send_file(filename, as_attachment=True)

    except Exception as e:
        return jsonify({'error': f'Download error: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True)