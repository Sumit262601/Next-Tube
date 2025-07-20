from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from yt_dlp import YoutubeDL
from PIL import Image
import os
import requests
from io import BytesIO

app = Flask(__name__)
CORS(app)

DOWNLOAD_DIR = 'downloads'
THUMBNAIL_DIR = 'thumbnails'
os.makedirs(DOWNLOAD_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)

@app.route('/api/info', methods=['POST'])
def get_info():
    url = request.json.get('url')
    if not url:
        return jsonify({'error': 'URL is required'}), 400

    try:
        ydl_opts = {
            'quiet': True,
            'format': 'bestvideo[height<=2160]+bestaudio/best[height<=2160]',
            'noplaylist': True,
        }
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        thumb_url = info.get('thumbnail')
        response = requests.get(thumb_url, timeout=10)
        img = Image.open(BytesIO(response.content))
        thumb_path = os.path.join(THUMBNAIL_DIR, f"{info['id']}.jpg")
        img.save(thumb_path)

        return jsonify({
            'id': info['id'],
            'title': info['title'],
            'duration': info['duration'],
            'views': info['view_count'],
            'thumbnail': f"/api/thumbnail/{info['id']}"
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/thumbnail/<video_id>', methods=['GET'])
def get_thumbnail(video_id):
    path = os.path.join(THUMBNAIL_DIR, f"{video_id}.jpg")
    if os.path.exists(path):
        return send_file(path, mimetype='image/jpeg')
    return jsonify({'error': 'Thumbnail not found'}), 404

@app.route('/api/download', methods=['POST'])
def download():
    data = request.json
    url = data.get('url')
    format = data.get('format', 'mp4')
    quality_label = data.get('quality', '1080p')

    quality = ''.join(filter(str.isdigit, quality_label)) or '1080'

    try:
        video_format = (
            f"bestvideo[height<={quality}]+bestaudio/best[height<={quality}]"
            if format in ['mp4', 'webm']
            else "bestaudio"
        )

        ydl_opts = {
            'outtmpl': os.path.join(DOWNLOAD_DIR, '%(title)s.%(ext)s'),
            'format': video_format,
            'merge_output_format': format if format in ['mp4', 'webm'] else None,
            'noplaylist': True,
            'quiet': True,
            'continuedl': True,
            'retries': 5,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': format,
                'preferredquality': '192',
            }] if format in ['mp3', 'wav'] else []
        }

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
