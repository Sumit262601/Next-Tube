from flask import Flask, request, jsonify, send_file, make_response
from flask_cors import CORS, cross_origin
from yt_dlp import YoutubeDL
from PIL import Image
import os
import requests
import re
from io import BytesIO
import certifi
import ssl
import traceback
import concurrent.futures
import time
import logging
from functools import wraps

# SSL Configuration
ssl._create_default_https_context = ssl.create_default_context(cafile=certifi.where())

app = Flask(__name__)

# ===== COMPLETE CORS SOLUTION =====

# Method 1: Comprehensive CORS setup
CORS(app, 
     origins=["*"],  # Allow all origins
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
     supports_credentials=False,  # Set to False for public API
     expose_headers=["Content-Range", "X-Content-Range"],
     max_age=86400  # Cache preflight for 24 hours
)

# Method 2: Manual CORS decorator
def add_cors_headers(response):
    """Add CORS headers to every response"""
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'false')
    return response

@app.after_request
def after_request(response):
    """Add CORS headers to all responses"""
    return add_cors_headers(response)

# Method 3: Handle preflight requests globally
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add('Access-Control-Allow-Headers', "*")
        response.headers.add('Access-Control-Allow-Methods', "*")
        return response

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
app.config.update(
    DOWNLOAD_DIR='downloads',
    THUMBNAIL_DIR='thumbnails',
    MAX_THUMBNAIL_SIZE=500,
    MAX_CONCURRENT_DOWNLOADS=4,
    REQUEST_TIMEOUT=30,
)

# Directory setup
os.makedirs(app.config['DOWNLOAD_DIR'], exist_ok=True)
os.makedirs(app.config['THUMBNAIL_DIR'], exist_ok=True)

# Thread pool for concurrent downloads
executor = concurrent.futures.ThreadPoolExecutor(max_workers=app.config['MAX_CONCURRENT_DOWNLOADS'])

def validate_url(url):
    """Enhanced URL validation"""
    if not url or not isinstance(url, str):
        return False
        
    patterns = [
        r'(https?://)?(www\.)?(youtube\.com|youtu\.be)/.+',
        r'(https?://)?(m\.)?youtube\.com/.+',
        r'(https?://)?music\.youtube\.com/.+',
    ]
    return any(re.match(pattern, url, re.IGNORECASE) for pattern in patterns)

def get_safe_response(data, status=200):
    """Create response with CORS headers"""
    response = make_response(jsonify(data), status)
    return add_cors_headers(response)

# ===== API ENDPOINTS WITH MULTIPLE CORS METHODS =====

@app.route('/api/health', methods=['GET', 'OPTIONS'])
@cross_origin()
def health_check():
    """Health check with CORS"""
    return get_safe_response({'status': 'ok', 'message': 'Server is running'})

@app.route('/api/detect_playlist', methods=['POST', 'OPTIONS'])
@cross_origin(origins='*', methods=['POST', 'OPTIONS'], allow_headers=['Content-Type'])
def detect_playlist():
    """Enhanced playlist detection with multiple CORS methods"""
    
    # Handle preflight
    if request.method == 'OPTIONS':
        return get_safe_response({'status': 'ok'})
    
    start_time = time.time()
    
    try:
        # Get URL from request
        if request.is_json:
            data = request.get_json(force=True)
            url = data.get('url', '').strip() if data else ''
        else:
            url = request.form.get('url', '').strip()
            
        logger.info(f"Processing URL: {url}")
        
        if not url:
            return get_safe_response({'error': 'URL is required'}, 400)

        if not validate_url(url):
            return get_safe_response({'error': 'Invalid YouTube URL'}, 400)

        # Enhanced yt-dlp options
        ydl_opts = {
            'quiet': True,
            'extract_flat': True,
            'no_warnings': True,
            'socket_timeout': 15,
            'retries': 2,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            'extractor_args': {
                'youtube': {
                    'skip': ['dash', 'hls'],
                    'player_skip': ['configs']
                }
            },
            'nocheckcertificate': True,
            'no_color': True,
            'geo_bypass': True,
        }

        try:
            with YoutubeDL(ydl_opts) as ydl:
                logger.info("Extracting info...")
                info = ydl.extract_info(url, download=False, process=False)
                
                if not info:
                    return get_safe_response({'error': 'No information extracted from URL'}, 404)
                
                response_data = {
                    'success': True,
                    'is_playlist': info.get('_type') == 'playlist',
                    'id': info.get('id'),
                    'title': info.get('title', 'Unknown'),
                    'processing_time': round(time.time() - start_time, 2)
                }
                
                if response_data['is_playlist']:
                    entries = info.get('entries', [])
                    valid_entries = [e for e in entries if e and e.get('id')]
                    response_data.update({
                        'video_count': len(valid_entries),
                        'thumbnail': info.get('thumbnails', [{}])[0].get('url') if info.get('thumbnails') else None,
                        'description': info.get('description', '')[:200] + '...' if info.get('description') else ''
                    })
                else:
                    response_data.update({
                        'type': 'video',
                        'duration': info.get('duration'),
                        'view_count': info.get('view_count')
                    })
                
                logger.info(f"Success: {response_data}")
                return get_safe_response(response_data)

        except Exception as e:
            logger.error(f"YT-DLP error: {str(e)}")
            return get_safe_response({
                'success': False,
                'error': 'Failed to analyze URL',
                'details': str(e)[:200],  # Limit error message length
                'is_playlist': None
            }, 500)

    except Exception as e:
        logger.error(f"Server error: {str(e)}\n{traceback.format_exc()}")
        return get_safe_response({
            'success': False,
            'error': 'Internal server error',
            'details': str(e)[:200]
        }, 500)

@app.route('/api/info', methods=['POST', 'OPTIONS'])
@cross_origin(origins='*')
def get_info():
    """Get detailed video/playlist info"""
    
    if request.method == 'OPTIONS':
        return get_safe_response({'status': 'ok'})
        
    try:
        # Get data from request
        if request.is_json:
            data = request.get_json(force=True)
        else:
            data = request.form.to_dict()
            
        url = data.get('url', '').strip() if data else ''
        
        if not url:
            return get_safe_response({'error': 'URL is required'}, 400)

        if not validate_url(url):
            return get_safe_response({'error': 'Invalid YouTube URL'}, 400)

        ydl_opts = {
            'format': 'best[height<=1080]/best',
            'quiet': True,
            'no_warnings': True,
            'socket_timeout': 20,
            'retries': 2,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            'extract_flat': False,  # Get full info
            'writeinfojson': False,
            'writethumbnail': False,
        }

        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            if not info:
                return get_safe_response({'error': 'Failed to extract video information'}, 404)

            # Handle playlist
            if info.get('_type') == 'playlist':
                videos = []
                entries = info.get('entries', [])[:20]  # Limit to first 20
                
                for entry in entries:
                    if not entry:
                        continue
                    videos.append({
                        'id': entry.get('id'),
                        'title': entry.get('title', 'Unknown'),
                        'duration': entry.get('duration'),
                        'uploader': entry.get('uploader', 'Unknown')
                    })

                return get_safe_response({
                    'success': True,
                    'type': 'playlist',
                    'id': info.get('id'),
                    'title': info.get('title'),
                    'video_count': len(videos),
                    'videos': videos
                })
            
            # Handle single video
            formats = []
            for f in info.get('formats', []):
                if f and f.get('height'):
                    formats.append({
                        'format_id': f.get('format_id'),
                        'height': f.get('height'),
                        'width': f.get('width'),
                        'ext': f.get('ext'),
                        'filesize': f.get('filesize')
                    })

            return get_safe_response({
                'success': True,
                'type': 'video',
                'id': info.get('id'),
                'title': info.get('title'),
                'duration': info.get('duration'),
                'views': info.get('view_count'),
                'formats': formats[:10],  # Limit formats
                'uploader': info.get('uploader')
            })

    except Exception as e:
        logger.error(f"Info error: {str(e)}")
        return get_safe_response({
            'success': False,
            'error': 'Failed to get video info',
            'details': str(e)[:200]
        }, 500)

# ===== FALLBACK ENDPOINTS =====

@app.route('/api/test', methods=['GET', 'POST', 'OPTIONS'])
@cross_origin()
def test_endpoint():
    """Simple test endpoint"""
    return get_safe_response({
        'success': True,
        'message': 'API is working',
        'method': request.method,
        'timestamp': time.time()
    })

@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return get_safe_response({
        'message': 'YouTube Downloader API',
        'version': '2.0',
        'endpoints': [
            '/api/health',
            '/api/test', 
            '/api/detect_playlist',
            '/api/info'
        ]
    })

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return get_safe_response({'error': 'Endpoint not found'}, 404)

@app.errorhandler(500)
def internal_error(error):
    return get_safe_response({'error': 'Internal server error'}, 500)

if __name__ == '__main__':
    print("=" * 50)
    print("🚀 YOUTUBE DOWNLOADER API STARTING")
    print("=" * 50)
    print("📍 Server URL: http://localhost:5000")
    print("📍 Health Check: http://localhost:5000/api/health")
    print("📍 Test Endpoint: http://localhost:5000/api/test")
    print("=" * 50)
    print("🔧 CORS: Enabled for all origins")
    print("🔧 Methods: GET, POST, OPTIONS")
    print("🔧 Headers: All allowed")
    print("=" * 50)
    
    # Run with threading support
    app.run(
        debug=True, 
        host='0.0.0.0', 
        port=5000, 
        threaded=True,
        use_reloader=True
    )